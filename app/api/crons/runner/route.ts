import { NextRequest, NextResponse } from 'next/server'
import { getDueHeartbeatTasks } from '@/lib/cron/heartbeat'
import { listDueScheduledTasks } from '@/lib/cron/due-scheduled'
import { prisma, withPrismaFallback } from '@/lib/db'
import { runAgentPipeline } from '@/lib/agents/pipeline'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { emitNotification } from '@/lib/notifications/emit'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  return header === `Bearer ${secret}` || alt === secret
}

async function runOne(opts: {
  id: string
  nameAr: string
  prompt: string
  scopeId: string
  channels: string[]
}) {
  const logId = `log-${opts.id}-${Date.now()}`
  const channel = opts.channels[0] || 'telegram'
  await withPrismaFallback(
    () =>
      prisma.cronLog.create({
        data: {
          id: logId,
          taskId: opts.id,
          taskNameAr: opts.nameAr,
          channel,
          recipient: null,
          status: 'running',
        },
      }),
    null
  )

  try {
    if (IS_AIR_GAPPED_MODE) {
      throw new Error(
        'عفواً، النظام يعمل حالياً في الوضع المحلي المغلق (Air-Gapped Mode) ولا يسمح بالاتصال بالخدمات الخارجية.'
      )
    }
    const scopeCtx = resolveActiveScope({
      userId: 'user-1',
      scopeId: opts.scopeId || 'shared-demo',
      scopes: DEMO_SCOPES,
    })
    const result = await runAgentPipeline({
      rawUserPrompt: opts.prompt,
      scopeCtx,
    })
    const text = `📋 ${opts.nameAr}\n\n${result.output}`.slice(0, 3500)
    for (const ch of opts.channels) {
      if (ch === 'telegram' || ch === 'whatsapp') {
        await emitNotification({
          channel: ch,
          textAr: text,
          meta: { scopeId: opts.scopeId },
        })
      }
    }
    await withPrismaFallback(
      () =>
        prisma.cronLog.update({
          where: { id: logId },
          data: { status: 'success', details: result.output.slice(0, 2000) },
        }),
      null
    )
    return { id: opts.id, status: 'success' as const }
  } catch (e) {
    const details = e instanceof Error ? e.message : 'error'
    await withPrismaFallback(
      () =>
        prisma.cronLog.update({
          where: { id: logId },
          data: { status: 'failed', details },
        }),
      null
    )
    return { id: opts.id, status: 'failed' as const, details }
  }
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const ran: Array<{ id: string; status: string; details?: string }> = []

  for (const task of getDueHeartbeatTasks(now)) {
    ran.push(
      await runOne({
        id: task.id,
        nameAr: task.nameAr,
        prompt: task.task,
        scopeId: 'shared-demo',
        channels: [task.channel === 'whatsapp' ? 'whatsapp' : 'telegram'],
      })
    )
  }

  const scheduled = await listDueScheduledTasks(now)
  for (const task of scheduled) {
    const channels = Array.isArray(task.notifyChannels)
      ? (task.notifyChannels as string[])
      : ['telegram']
    const result = await runOne({
      id: task.id,
      nameAr: task.nameAr,
      prompt: task.prompt,
      scopeId: task.scopeId,
      channels,
    })
    ran.push(result)
    if (result.status === 'success') {
      await withPrismaFallback(
        () =>
          prisma.scheduledTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              nextRunAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
          }),
        null
      )
    }
  }

  return NextResponse.json({ ran, scheduledCount: scheduled.length })
}
