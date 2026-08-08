import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { buildOwnerMorningBrief } from '@/lib/digest/owner-morning-brief'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { emitNotification } from '@/lib/notifications/emit'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/**
 * Owner morning brief for لوحة اليوم.
 * GET: card payload. POST { sendTelegram: true }: optional DM (owner only, skips empty).
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const scopeId =
    req.nextUrl.searchParams.get('scopeId') || PRIMARY_TEAM_SCOPE_ID
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }

  const brief = await buildOwnerMorningBrief(scopeId)
  return NextResponse.json({
    ok: true,
    scopeId,
    ...brief,
    messageAr: brief.hasContent
      ? 'إحاطة الصباح جاهزة'
      : 'لا جديد هذا الصباح — لا بريد عاجل ولا تعارضات.',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  if (!isWorkspaceOwnerEmail(auth.user.email)) {
    return NextResponse.json(
      { error: 'إرسال الإحاطة لتيليجرام للمالك فقط.' },
      { status: 403 }
    )
  }

  let body: { scopeId?: string; sendTelegram?: boolean } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const scopeId = body.scopeId || PRIMARY_TEAM_SCOPE_ID
  const brief = await buildOwnerMorningBrief(scopeId)

  if (!body.sendTelegram) {
    return NextResponse.json({ ok: true, ...brief })
  }

  if (!brief.hasContent) {
    return NextResponse.json({
      ok: true,
      sent: false,
      skipped: true,
      reason: 'empty',
      messageAr: 'لا محتوى — لم يُرسل شيء لتجنب الإزعاج.',
    })
  }

  const r = await emitNotification({
    channel: 'telegram',
    textAr: brief.textAr,
    meta: { scopeId, kind: 'owner_morning_brief' },
  })

  return NextResponse.json({
    ok: r.ok,
    sent: r.ok,
    messageAr: r.ok
      ? 'أُرسلت إحاطة الصباح إلى تيليجرام'
      : 'تعذّر الإرسال — تحقق من ربط تيليجرام',
  })
}
