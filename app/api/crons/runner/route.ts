import { NextRequest, NextResponse } from 'next/server'
import { getDueHeartbeatTasks } from '@/lib/cron/heartbeat'
import { prisma, withPrismaFallback } from '@/lib/db'
import { runAgentPipeline } from '@/lib/agents/pipeline'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  return header === `Bearer ${secret}` || alt === secret
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = getDueHeartbeatTasks(new Date())
  const ran: Array<{ id: string; status: string }> = []

  for (const task of due) {
    const logId = `log-${task.id}-${Date.now()}`
    await withPrismaFallback(
      () =>
        prisma.cronLog.create({
          data: {
            id: logId,
            taskId: task.id,
            taskNameAr: task.nameAr,
            channel: task.channel,
            recipient: task.recipient,
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
        scopeId: 'shared-demo',
        scopes: DEMO_SCOPES,
      })
      const result = await runAgentPipeline({
        rawUserPrompt: task.task,
        scopeCtx,
      })
      if (task.channel === 'whatsapp') {
        await sendWhatsAppText(task.recipient, result.output)
      }
      await withPrismaFallback(
        () =>
          prisma.cronLog.update({
            where: { id: logId },
            data: { status: 'success', details: result.output.slice(0, 2000) },
          }),
      null
      )
      ran.push({ id: task.id, status: 'success' })
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
      ran.push({ id: task.id, status: 'failed' })
    }
  }

  return NextResponse.json({ ran, skipped: [] })
}
