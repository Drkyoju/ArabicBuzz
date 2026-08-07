import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import {
  getWorkspaceReadiness,
  runAutoSyncPass,
} from '@/lib/integrations/auto-wire'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorizeCron(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  return Boolean(secret) && secret !== 'change-me' &&
    (header === `Bearer ${secret}` || alt === secret)
}

/**
 * Quiet auto-sync: mail → room, calendar, Drive brain, Telegram webhook.
 * Owner session or CRON_SECRET. No UI «connect» required when creds exist.
 */
export async function POST(req: NextRequest) {
  const cronOk = authorizeCron(req)
  if (!cronOk) {
    const auth = await requireRealUser(req)
    if (!auth.ok) return auth.response
    if (!isWorkspaceOwnerEmail(auth.user.email)) {
      return NextResponse.json(
        { error: 'المزامنة التلقائية للمالك فقط.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
  }

  const readiness = await getWorkspaceReadiness()
  const sync = await runAutoSyncPass()
  return NextResponse.json({
    ok: true,
    readiness,
    sync,
    messageAr: readiness.messageAr,
  })
}

/** Status-only readiness for settings UI. */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json(
      { error: 'يلزم تسجيل الدخول.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }

  const readiness = await getWorkspaceReadiness()
  // Fire-and-forget quiet sync when already wired (no user click).
  if (isWorkspaceOwnerEmail(user.email) && readiness.ready) {
    void runAutoSyncPass().catch(() => undefined)
  }

  return NextResponse.json({
    ...readiness,
    isOwner: isWorkspaceOwnerEmail(user.email),
  })
}
