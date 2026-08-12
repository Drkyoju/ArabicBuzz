import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser, requireSessionUser } from '@/lib/auth/session'
import {
  listRoomMembers,
  setMemberCalendarSync,
} from '@/lib/rooms/persist'
import {
  copyGoogleEventsToRoom,
  syncAllOptedInGoogleToRooms,
  syncCurrentUserGoogleToRoom,
  syncGoogleCalendarToRoom,
} from '@/lib/rooms/room-calendar-google-sync'
import { displayNameFromUser } from '@/lib/auth/display-name'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

export const dynamic = 'force-dynamic'

function authorizeCron(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  if (!secret || secret === 'change-me') return false
  return header === `Bearer ${secret}` || alt === secret
}

/** Preference + sync status for current user in a room. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = teamCalendarScopeId(
    req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  )
  const { members } = await listRoomMembers(scopeId)
  const member =
    members.find((m) => m.userId === auth.user.id) ||
    (auth.user.email
      ? members.find(
          (m) =>
            m.email &&
            m.email.toLowerCase() === auth.user.email!.toLowerCase()
        )
      : undefined)

  return NextResponse.json({
    scopeId,
    calendarSyncEnabled: Boolean(member?.calendarSyncEnabled),
    memberId: member?.id || null,
    messageAr: member?.calendarSyncEnabled
      ? 'نشر مواعيدك من Google في تقويم الفريق مفعّل.'
      : 'نشر مواعيد Google في تقويم الفريق متوقف (افتراضي).',
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    scopeId?: string
    enabled?: boolean
    acknowledged?: boolean
    googleEventIds?: string[]
  }
  const action = String(body.action || 'sync_now')
  const scopeId = teamCalendarScopeId(String(body.scopeId || 'shared-demo'))

  if (action === 'cron') {
    if (!authorizeCron(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const batch = await syncAllOptedInGoogleToRooms()
    return NextResponse.json({ ok: true, ...batch })
  }

  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const user = auth.user
  const displayNameAr = displayNameFromUser(user, 'عضو')

  if (action === 'set_preference') {
    const enabled = body.enabled === true
    if (enabled && body.acknowledged !== true) {
      return NextResponse.json(
        {
          error:
            'يلزم الموافقة الصريحة: ربط Google قد يعرض مواعيدك القادمة لفريق الغرفة.',
          code: 'CONSENT_REQUIRED',
        },
        { status: 400 }
      )
    }
    const result = await setMemberCalendarSync({
      scopeId,
      userId: user.id,
      email: user.email,
      displayNameAr,
      enabled,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'تعذّر حفظ التفضيل' },
        { status: 400 }
      )
    }

    let sync: unknown = null
    if (enabled) {
      sync = await syncGoogleCalendarToRoom({
        scopeId,
        userId: user.id,
        displayNameAr: result.member?.displayNameAr || displayNameAr,
      })
    }

    return NextResponse.json({
      ok: true,
      calendarSyncEnabled: enabled,
      member: result.member,
      sync,
      messageAr: enabled
        ? 'تم تفعيل نشر مواعيد Google في تقويم الفريق — جرت المزامنة الأولى.'
        : 'تم إيقاف نشر مواعيد Google. المواعيد المنسوخة سابقاً تبقى حتى تُلغى يدوياً أو تُحدَّث لاحقاً.',
    })
  }

  if (action === 'sync_now') {
    const result = await syncCurrentUserGoogleToRoom({
      scopeId,
      userId: user.id,
      email: user.email,
      displayNameAr,
    })
    if (!result.enabled) {
      return NextResponse.json(
        {
          error: result.messageAr,
          code: 'SYNC_DISABLED',
          ...result,
        },
        { status: 400 }
      )
    }
    if (result.error) {
      return NextResponse.json(
        { error: result.error, ...result },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, ...result })
  }

  /** One-shot: copy selected personal Google events → shared room (no continuous opt-in). */
  if (action === 'copy_selected' || action === 'copy_from_google') {
    const { assertRoomCanEdit } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanEdit(scopeId, user.id, user.email)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 403 })
    }
    const ids = Array.isArray(body.googleEventIds)
      ? body.googleEventIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
    const result = await copyGoogleEventsToRoom({
      scopeId,
      userId: user.id,
      displayNameAr,
      googleEventIds: ids,
    })
    if (result.error && result.created + result.updated === 0) {
      return NextResponse.json(
        { error: result.error, ...result },
        { status: 400 }
      )
    }
    return NextResponse.json({
      ok: true,
      ...result,
      messageAr:
        result.messageAr ||
        'نُسخت المواعيد المحددة إلى مواعيد الجمعية (التقويم المشترك).',
    })
  }

  return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
}
