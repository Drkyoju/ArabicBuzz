import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  cancelRoomCalendarEvent,
  cancelTestCalendarEvents,
  createRoomCalendarEvent,
  ingestProposedDates,
  listRoomCalendarEvents,
  reconcileRoomCalendar,
  updateRoomCalendarEvent,
} from '@/lib/rooms/room-calendar'
import { isDirectorEmail } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/** Shared room calendar — belongs to scope, not one Google account. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  const from = req.nextUrl.searchParams.get('from') || undefined
  const to = req.nextUrl.searchParams.get('to') || undefined
  const events = await listRoomCalendarEvents({ scopeId, from, to })
  const { isPersonalScopeId } = await import('@/lib/scopes/personal-desk')
  return NextResponse.json({
    scopeId,
    count: events.length,
    events,
    messageAr: isPersonalScopeId(scopeId)
      ? 'تقويم مساحتك الشخصية — خاص بك وحدك، منفصل عن تقويم الفريق.'
      : 'تقويم الغرفة المشترك — للجميع وللوكيل. المصدر الرسمي لمواعيد الفريق؛ Google اختياري كنسخة خاصة لمن يفعّلها فقط.',
  })
}

export async function POST(req: NextRequest) {
  const { requireRealUser } = await import('@/lib/auth/session')
  const { assertRoomCanEdit } = await import('@/lib/rooms/persist')
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const user = auth.user
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    scopeId?: string
    titleAr?: string
    descriptionAr?: string
    startsAt?: string
    endsAt?: string
    allDay?: boolean
    locationAr?: string
    attendees?: string[]
    source?: 'manual' | 'ai' | 'email' | 'import'
    eventId?: string
    autoAdjust?: boolean
    notify?: boolean
    copyToGoogle?: boolean
    proposals?: Array<{
      titleAr: string
      startsAt: string
      endsAt: string
      fromEmail?: string
      notesAr?: string
    }>
    patch?: Record<string, unknown>
  }

  const scopeId = String(body.scopeId || 'shared-demo')
  const gate = await assertRoomCanEdit(scopeId, user.id, user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  const action = String(body.action || 'create')
  const createdBy = user.id
  const createdByAr =
    (user.user_metadata?.full_name as string) ||
    user.email?.split('@')[0] ||
    'عضو'

  try {
    if (action === 'list') {
      const events = await listRoomCalendarEvents({ scopeId })
      return NextResponse.json({ events, count: events.length })
    }

    if (action === 'ingest') {
      const proposals = Array.isArray(body.proposals) ? body.proposals : []
      if (!proposals.length) {
        return NextResponse.json(
          { error: 'يلزم proposals[] لدمج المواعيد' },
          { status: 400 }
        )
      }
      const result = await ingestProposedDates({
        scopeId,
        proposals,
        createdBy,
        createdByAr: 'دمج من بريد/وكيل',
      })
      return NextResponse.json({
        ...result,
        messageAr: `أُضيف ${result.created.length} · عُدّل ${result.adjusted.length} · تُخطّي ${result.skipped.length}`,
      })
    }

    if (action === 'reconcile') {
      const result = await reconcileRoomCalendar({
        scopeId,
        autoAdjust: Boolean(body.autoAdjust),
        notify: body.notify !== false,
      })
      const messageAr =
        result.conflicts.length === 0
          ? 'تقويم الغرفة بلا تعارضات ظاهرة.'
          : result.adjusted.length > 0
            ? `وُجد ${result.conflicts.length} تعارضاً — عُدّل ${result.adjusted.length} موعداً.`
            : `وُجد ${result.conflicts.length} تعارضاً — مرّر autoAdjust=true لإزاحة المواعيد.`
      return NextResponse.json({
        events: result.events,
        conflicts: result.conflicts,
        adjusted: result.adjusted,
        count: result.events.length,
        conflictCount: result.conflicts.length,
        messageAr,
      })
    }

    if (action === 'update') {
      const eventId = String(body.eventId || '')
      if (!eventId) {
        return NextResponse.json({ error: 'يلزم eventId' }, { status: 400 })
      }
      const patch = body.patch || {}
      const result = await updateRoomCalendarEvent(eventId, scopeId, {
        titleAr: patch.titleAr != null ? String(patch.titleAr) : undefined,
        descriptionAr:
          patch.descriptionAr !== undefined
            ? patch.descriptionAr == null
              ? null
              : String(patch.descriptionAr)
            : undefined,
        startsAt:
          patch.startsAt != null ? String(patch.startsAt) : undefined,
        endsAt: patch.endsAt != null ? String(patch.endsAt) : undefined,
        allDay:
          typeof patch.allDay === 'boolean' ? patch.allDay : undefined,
        locationAr:
          patch.locationAr !== undefined
            ? patch.locationAr == null
              ? null
              : String(patch.locationAr)
            : undefined,
        attendees: Array.isArray(patch.attendees)
          ? patch.attendees.map(String)
          : undefined,
        status:
          patch.status === 'cancelled' ||
          patch.status === 'tentative' ||
          patch.status === 'confirmed'
            ? patch.status
            : undefined,
      })
      return NextResponse.json({
        ...result,
        messageAr:
          result.conflicts.length > 0
            ? `حُدّث مع ${result.conflicts.length} تعارض محتمل`
            : 'تم التحديث',
      })
    }

    if (action === 'cancel') {
      const eventId = String(body.eventId || '')
      if (!eventId) {
        return NextResponse.json({ error: 'يلزم eventId' }, { status: 400 })
      }
      const result = await cancelRoomCalendarEvent(eventId, scopeId)
      return NextResponse.json({
        ...result,
        messageAr: 'أُلغي الموعد من تقويم الغرفة',
      })
    }

    if (action === 'cleanup_test') {
      if (!isDirectorEmail(user.email)) {
        return NextResponse.json(
          { error: 'تنظيف مواعيد الاختبار للمدير فقط' },
          { status: 403 }
        )
      }
      const result = await cancelTestCalendarEvents(scopeId)
      return NextResponse.json({
        ...result,
        messageAr:
          result.cancelled === 0
            ? 'لا مواعيد اختبار ظاهرة في التقويم'
            : `أُلغي ${result.cancelled} موعد اختبار من التقويم`,
      })
    }

    // create
    const result = await createRoomCalendarEvent({
      scopeId,
      titleAr: String(body.titleAr || ''),
      descriptionAr: body.descriptionAr,
      startsAt: String(body.startsAt || ''),
      endsAt: String(body.endsAt || ''),
      allDay: body.allDay,
      locationAr: body.locationAr,
      attendees: body.attendees,
      source: body.source || 'manual',
      createdBy,
      createdByAr,
    })

    // Opt-in only: copy to the *acting user's* Google — never the room owner's
    // or another member's calendar. Shared room DB remains source of truth.
    let googleNote = ''
    if (body.copyToGoogle === true) {
      try {
        const { listGoogleAccounts } = await import('@/lib/google/tokens')
        const { createCalendarEvent } = await import('@/lib/google/calendar')
        const { getSupabaseAdmin } = await import('@/lib/supabase/server')
        const accounts = await listGoogleAccounts(user.id)
        if (accounts.length > 0) {
          const g = await createCalendarEvent(user.id, {
            summary: result.event.titleAr,
            description: result.event.descriptionAr || undefined,
            location: result.event.locationAr || undefined,
            startIso: result.event.startsAt,
            endIso: result.event.endsAt,
            timeZone: 'Asia/Riyadh',
            attendeeEmails: result.event.attendees,
          })
          const sb = getSupabaseAdmin()
          if (sb && g.id) {
            await sb
              .from('room_calendar_events')
              .update({ google_event_id: g.id })
              .eq('id', result.event.id)
              .eq('scope_id', scopeId)
          }
          googleNote = ' · ونُسخت نسخة خاصة إلى تقويمك على Google'
        } else {
          googleNote = ' · لم تُنسخ إلى Google (حسابك غير مربوط)'
        }
      } catch {
        googleNote = ' · تعذّرت النسخة الخاصة إلى Google'
      }
    }

    return NextResponse.json({
      ...result,
      created: true,
      messageAr:
        result.conflicts.length > 0
          ? `تم إنشاء الموعد في تقويم الغرفة (ظاهر للفريق). تنبيه فقط: ${result.conflicts.length} تعارض زمني محتمل. ${result.suggestion?.messageAr || ''}${googleNote}`
          : `أُضيف الموعد إلى تقويم الغرفة المشترك (ظاهر للفريق)${googleNote}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل العملية' },
      { status: 400 }
    )
  }
}
