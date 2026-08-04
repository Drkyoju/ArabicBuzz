import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth/session'
import {
  cancelRoomCalendarEvent,
  createRoomCalendarEvent,
  ingestProposedDates,
  listRoomCalendarEvents,
  updateRoomCalendarEvent,
} from '@/lib/rooms/room-calendar'

export const dynamic = 'force-dynamic'

/** Shared room calendar — belongs to scope, not one Google account. */
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const from = req.nextUrl.searchParams.get('from') || undefined
  const to = req.nextUrl.searchParams.get('to') || undefined
  const events = await listRoomCalendarEvents({ scopeId, from, to })
  return NextResponse.json({
    scopeId,
    count: events.length,
    events,
    messageAr:
      'تقويم الغرفة المشترك — للجميع وللوكيل. Google اختياري للمزامنة الخارجية.',
  })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
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
  const action = String(body.action || 'create')
  const createdBy = user?.id || 'local-owner'
  const createdByAr =
    (user?.user_metadata?.full_name as string) ||
    user?.email?.split('@')[0] ||
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
    return NextResponse.json({
      ...result,
      messageAr:
        result.conflicts.length > 0
          ? `أُضيف الموعد — تنبيه: ${result.conflicts.length} تعارض. ${result.suggestion?.messageAr || ''}`
          : 'أُضيف الموعد إلى تقويم الغرفة المشترك',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل العملية' },
      { status: 400 }
    )
  }
}
