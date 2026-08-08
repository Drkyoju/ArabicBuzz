import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { listGoogleAccounts } from '@/lib/google/tokens'
import { listGmailMailbox } from '@/lib/google/gmail'
import { listPendingMailEnergyForUser } from '@/lib/email/mail-energy-store'

export const dynamic = 'force-dynamic'

/**
 * Lightweight personal Gmail unread count for polling / browser notifications.
 * Also surfaces due-soon energy jobs (reminders) for client toast.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const accounts = await listGoogleAccounts(auth.user.id)
  if (!accounts.length) {
    return NextResponse.json({
      connected: false,
      unread: 0,
      email: null,
      dueReminders: 0,
    })
  }

  const accountEmail =
    req.nextUrl.searchParams.get('accountEmail')?.trim().toLowerCase() ||
    accounts[0]?.email ||
    null

  try {
    const [list, jobs] = await Promise.all([
      listGmailMailbox(auth.user.id, {
        folder: 'UNREAD',
        maxResults: 20,
        accountEmail,
      }),
      listPendingMailEnergyForUser(auth.user.id).catch(() => []),
    ])
    const unread = list.resultSizeEstimate ?? list.messages.length
    const dueSoon = jobs.filter(
      (j) =>
        j.kind === 'reminder' &&
        j.dueAt.getTime() <= Date.now() + 5 * 60_000
    ).length

    return NextResponse.json({
      connected: true,
      unread,
      email: accountEmail || accounts[0]?.email || null,
      dueReminders: dueSoon,
      pendingEnergy: jobs.length,
      sampleSubjects: list.messages.slice(0, 3).map((m) => m.subject),
    })
  } catch (e) {
    return NextResponse.json({
      connected: true,
      unread: 0,
      email: accountEmail,
      warningAr: e instanceof Error ? e.message : 'تعذّر عدّ غير المقروء',
    })
  }
}
