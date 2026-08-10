import { NextRequest, NextResponse } from 'next/server'
import { syncImapInbox } from '@/lib/email/imap-sync'
import { isImapConfigured, countUnread } from '@/lib/email/imap-store'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  return Boolean(secret) && (header === `Bearer ${secret}` || alt === secret)
}

/** Cron: poll IMAP, store new mail, optional Telegram notify. */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isImapConfigured())) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'imap_not_configured',
      messageAr: 'IMAP غير مضبوط — لا مزامنة.',
    })
  }

  const { isTelegramGroupPushAllowed } = await import(
    '@/lib/telegram/group-push-policy'
  )
  const result = await syncImapInbox({
    maxMessages: 50,
    notifyTelegram: isTelegramGroupPushAllowed('imap_notify'),
  })
  const unread = await countUnread().catch(() => 0)
  return NextResponse.json({ ...result, unread })
}
