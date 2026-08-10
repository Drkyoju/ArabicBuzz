import { NextRequest, NextResponse } from 'next/server'
import { getDueHeartbeatTasks } from '@/lib/cron/heartbeat'
import { listDueScheduledTasks } from '@/lib/cron/due-scheduled'
import { prisma, withPrismaFallback } from '@/lib/db'
import { runAgentPipeline } from '@/lib/agents/pipeline'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { emitNotification } from '@/lib/notifications/emit'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { appBaseUrl } from '@/lib/app-url'
import { runDeadlineTelegramReminders } from '@/lib/rooms/deadline-reminders'
import {
  isTelegramGroupPushAllowed,
  telegramGroupPushDisabledReason,
  telegramGroupPushFlagsSnapshot,
} from '@/lib/telegram/group-push-policy'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  return header === `Bearer ${secret}` || alt === secret
}

async function buildActionableDigest(opts: {
  nameAr: string
  body: string
  scopeId: string
}) {
  const pending = await listPendingApprovals().catch(() => [])
  const scoped = pending.filter(
    (p) => !p.scopeId || p.scopeId === opts.scopeId
  )
  const base = appBaseUrl()
  const lines = [
    `📋 ${opts.nameAr}`,
    '',
    opts.body.trim(),
    '',
  ]
  if (scoped.length > 0) {
    lines.push('── إجراءات تحتاج قرارك ──')
    for (const p of scoped.slice(0, 5)) {
      lines.push(`• ${p.actionName} (${p.riskLevel === 'HIGH' ? 'عالي' : 'منخفض'})`)
    }
    lines.push('')
    lines.push(`👉 راجع الآن: ${base}/?section=approvals`)
  } else {
    lines.push('لا موافقات معلّقة حالياً.')
    lines.push(`الغرفة: ${base}/`)
  }
  return lines.join('\n').slice(0, 3500)
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
    const text = await buildActionableDigest({
      nameAr: opts.nameAr,
      body: result.output,
      scopeId: opts.scopeId,
    })
    for (const ch of opts.channels) {
      if (ch === 'telegram') {
        if (!isTelegramGroupPushAllowed('scheduled_task')) {
          continue
        }
        await emitNotification({
          channel: 'telegram',
          textAr: text,
          meta: { scopeId: opts.scopeId },
        })
      } else if (ch === 'whatsapp') {
        await emitNotification({
          channel: 'whatsapp',
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
    if (
      task.channel === 'telegram' &&
      !isTelegramGroupPushAllowed('heartbeat')
    ) {
      ran.push({
        id: task.id,
        status: 'skipped',
        details: telegramGroupPushDisabledReason('heartbeat'),
      })
      continue
    }
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

  const deadlineReminders = await runDeadlineTelegramReminders().catch((e) => ({
    sent: 0,
    skipped: 0,
    details: [e instanceof Error ? e.message : 'deadline reminder error'],
  }))

  let appointmentReminders: unknown = null
  try {
    const { runAppointmentTelegramReminders } = await import(
      '@/lib/rooms/appointment-reminders'
    )
    appointmentReminders = await runAppointmentTelegramReminders({ now })
  } catch (e) {
    appointmentReminders = {
      ok: false,
      error: e instanceof Error ? e.message : 'appointment reminder error',
    }
  }

  let directorDigest: unknown = null
  try {
    const { isDirectorDigestDay, sendDirectorWeeklyDigest } = await import(
      '@/lib/digest/director-weekly'
    )
    if (isDirectorDigestDay(now)) {
      directorDigest = await sendDirectorWeeklyDigest({
        scopeId: 'shared-demo',
      })
    } else {
      directorDigest = { skipped: true, reason: 'not_thursday_riyadh' }
    }
  } catch (e) {
    directorDigest = {
      ok: false,
      error: e instanceof Error ? e.message : 'digest error',
    }
  }

  let weeklyGroupChat: unknown = null
  try {
    const { sendWeeklyGroupChatDigests } = await import(
      '@/lib/digest/weekly-group-chat'
    )
    weeklyGroupChat = await sendWeeklyGroupChatDigests({ now })
  } catch (e) {
    weeklyGroupChat = {
      ok: false,
      error: e instanceof Error ? e.message : 'weekly group chat digest error',
    }
  }

  let driveBrainSync: unknown = null
  try {
    const secret =
      process.env.BRAIN_SYNC_SECRET ||
      process.env.DRIVE_BRAIN_SYNC_SECRET ||
      process.env.CRON_SECRET ||
      ''
    if (secret && secret !== 'change-me') {
      const base = appBaseUrl()
      const syncRes = await fetch(`${base}/api/google/drive/brain/cron`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ maxFiles: 6 }),
        signal: AbortSignal.timeout(55_000),
      })
      driveBrainSync = await syncRes.json().catch(() => ({
        ok: false,
        status: syncRes.status,
      }))
    } else {
      driveBrainSync = { skipped: true, reason: 'no_cron_secret' }
    }
  } catch (e) {
    driveBrainSync = {
      ok: false,
      error: e instanceof Error ? e.message : 'drive brain sync error',
    }
  }

  let telegramFileJobs: unknown = null
  try {
    const { runReadyTelegramFileJobs } = await import(
      '@/lib/telegram/execute-file-jobs'
    )
    // Jobs first — bind resent file_ids + execute before any heavy archive.
    telegramFileJobs = await runReadyTelegramFileJobs({
      chatId: '-1003855925966',
      scopeId: 'shared-demo',
      limit: 20,
    })
  } catch (e) {
    telegramFileJobs = {
      ok: false,
      error: e instanceof Error ? e.message : 'telegram file jobs error',
    }
  }

  let telegramGroupArchive: unknown = null
  try {
    const { archiveTelegramGroupToDrive, resolveAndRunPendingPdfJob } =
      await import('@/lib/telegram/group-archive')
    const archive = await archiveTelegramGroupToDrive({
      chatId: '-1003855925966',
      scopeId: 'shared-demo',
      syncRoom: true,
      // Avoid hung loca.lt / Mac hop during cron — file jobs already tried cascade.
      syncMac: false,
      // Keep attachment archive snappy; deep MTProto runs in a separate best-effort step.
      skipDeepHistory: true,
      attachmentLimit: 40,
    })
    const pendingPdf = await resolveAndRunPendingPdfJob({
      jobId: '96dee180-e828-49db-a2df-0d3a411e90a6',
      chatId: '-1003855925966',
      scopeId: 'shared-demo',
      findEmptyPage: true,
      afterPage: 45,
      queryNames: [
        'المعلم الاول',
        'المعلم الأول',
        'المعلم الأول من معالم من السيرة النبوية',
        'المعلم الاول من معالم من السيرة النبوية',
        'المعلم الأول.pdf',
        'المعلم الاول.pdf',
      ],
    })
    telegramGroupArchive = { ok: true, archive, pendingPdf }
  } catch (e) {
    telegramGroupArchive = {
      ok: false,
      error: e instanceof Error ? e.message : 'telegram archive error',
    }
  }

  // Best-effort MTProto history → Drive/room when Mac hop + Telethon session ready.
  // Session lives on Mac — probe /telegram/history-status (not CranL SESSION env).
  // Capped so cron does not 504; advances an in-memory cursor across runs.
  let telegramDeepHistory: unknown = null
  try {
    const {
      probeDeepHistoryCredentialsReady,
      scanTelegramGroupDeepHistory,
    } = await import('@/lib/telegram/history-scan')
    const probe = await probeDeepHistoryCredentialsReady()
    if (!probe.ready) {
      telegramDeepHistory = {
        skipped: true,
        reason: !probe.status.macHopConfigured
          ? 'mac_sync_unset'
          : !probe.macReachable
            ? 'mac_unreachable'
            : 'credentials_not_ready',
        macReachable: probe.macReachable,
        mtprotoOnMac: probe.mtprotoOnMac,
        setupAr: probe.status.setupAr,
      }
    } else {
      const scanPromise = scanTelegramGroupDeepHistory({
        chatId: '-1003855925966',
        scopeId: 'shared-demo',
        muallimOnly: false,
        limit: 60,
        download: true,
        skipCredentialProbe: true,
      })
      telegramDeepHistory = await Promise.race([
        scanPromise,
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: false,
                timedOut: true,
                credentialsReady: true,
                errorAr: 'انتهت مهلة مسح التاريخ — يُعاد في الكرون التالي',
              }),
            40_000
          )
        ),
      ])
    }
  } catch (e) {
    telegramDeepHistory = {
      ok: false,
      error: e instanceof Error ? e.message : 'telegram deep history error',
    }
  }

  let morningDigest: unknown = null
  try {
    const { sendMorningRoomDigests } = await import(
      '@/lib/digest/morning-room'
    )
    morningDigest = await sendMorningRoomDigests({ now })
  } catch (e) {
    morningDigest = {
      ok: false,
      error: e instanceof Error ? e.message : 'morning digest error',
    }
  }

  let overdueNudge: unknown = null
  try {
    const { sendOverdueNudges } = await import('@/lib/digest/overdue-nudge')
    overdueNudge = await sendOverdueNudges({ now })
  } catch (e) {
    overdueNudge = {
      ok: false,
      error: e instanceof Error ? e.message : 'overdue nudge error',
    }
  }

  let googleRoomCalendarSync: unknown = null
  try {
    const { syncAllOptedInGoogleToRooms } = await import(
      '@/lib/rooms/room-calendar-google-sync'
    )
    googleRoomCalendarSync = await syncAllOptedInGoogleToRooms()
  } catch (e) {
    googleRoomCalendarSync = {
      ok: false,
      error: e instanceof Error ? e.message : 'google room calendar sync error',
    }
  }

  let imapMailSync: unknown = null
  try {
    const { isImapConfigured } = await import('@/lib/email/imap-store')
    if (await isImapConfigured()) {
      const { syncImapInbox } = await import('@/lib/email/imap-sync')
      imapMailSync = await syncImapInbox({
        maxMessages: 50,
        notifyTelegram: isTelegramGroupPushAllowed('imap_notify'),
      })
    } else {
      imapMailSync = { skipped: true, reason: 'imap_not_configured' }
    }
  } catch (e) {
    imapMailSync = {
      ok: false,
      error: e instanceof Error ? e.message : 'imap sync error',
    }
  }

  let autoWire: unknown = null
  try {
    const { getWorkspaceReadiness } = await import(
      '@/lib/integrations/auto-wire'
    )
    // Ensures Telegram webhook + reports lane status (mail/calendar/Drive).
    autoWire = await getWorkspaceReadiness()
  } catch (e) {
    autoWire = {
      ok: false,
      error: e instanceof Error ? e.message : 'auto-wire error',
    }
  }

  // Room chat retention: delete room_posts older than N days (default 4).
  // Does not delete workspace_files (ملفات الفريق archive).
  let roomChatRetention: unknown = null
  try {
    const { pruneExpiredRoomPosts } = await import('@/lib/rooms/persist')
    roomChatRetention = await pruneExpiredRoomPosts()
  } catch (e) {
    roomChatRetention = {
      ok: false,
      error: e instanceof Error ? e.message : 'room chat retention error',
    }
  }

  // Scheduled vault archive backup (index + small files when feasible).
  let vaultBackup: unknown = null
  try {
    const { runScheduledVaultBackups } = await import(
      '@/lib/storage/vault-backup'
    )
    vaultBackup = await runScheduledVaultBackups()
  } catch (e) {
    vaultBackup = {
      ok: false,
      error: e instanceof Error ? e.message : 'vault backup error',
    }
  }

  let mailEnergy: unknown = null
  try {
    const { runDueMailEnergyJobs } = await import(
      '@/lib/email/mail-energy-runner'
    )
    mailEnergy = await runDueMailEnergyJobs(now)
  } catch (e) {
    mailEnergy = {
      ok: false,
      error: e instanceof Error ? e.message : 'mail energy error',
    }
  }

  return NextResponse.json({
    ran,
    scheduledCount: scheduled.length,
    deadlineReminders,
    appointmentReminders,
    directorDigest,
    weeklyGroupChat,
    driveBrainSync,
    telegramGroupArchive,
    telegramDeepHistory,
    morningDigest,
    overdueNudge,
    googleRoomCalendarSync,
    imapMailSync,
    autoWire,
    roomChatRetention,
    vaultBackup,
    mailEnergy,
    telegramFileJobs,
    telegramGroupPush: telegramGroupPushFlagsSnapshot(),
  })
}
