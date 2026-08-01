import { requireUser } from '@/lib/auth/session'
import {
  deleteGoogleTokens,
  getGoogleTokenRow,
  upsertGoogleTokens,
} from '@/lib/google/tokens'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listUpcomingEvents,
  scanEmailForMeetings,
} from '@/lib/google/calendar'

export const dynamic = 'force-dynamic'

/** Status + upcoming events, or save/disconnect tokens. */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'status'
  const row = await getGoogleTokenRow(auth.user.id)

  if (action === 'status') {
    return Response.json({
      connected: Boolean(row?.access_token),
      email: row?.email || auth.user.email || null,
      scopes: row?.scopes || null,
      expiresAt: row?.expires_at || null,
    })
  }

  if (!row?.access_token) {
    return Response.json(
      { error: 'تقويم Google غير مربوط.', connected: false },
      { status: 400 }
    )
  }

  try {
    if (action === 'events') {
      const events = await listUpcomingEvents(auth.user.id, {
        maxResults: Number(url.searchParams.get('max') || 10),
        query: url.searchParams.get('q') || undefined,
      })
      return Response.json({ connected: true, events })
    }
    if (action === 'scan-email') {
      const meetings = await scanEmailForMeetings(auth.user.id)
      return Response.json({ connected: true, meetings })
    }
    return Response.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشل التقويم' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    accessToken?: string
    refreshToken?: string | null
    expiresAt?: string | null
    scopes?: string | null
    email?: string | null
    summary?: string
    startIso?: string
    endIso?: string
    description?: string
    conferenceUrl?: string
    reminderMinutes?: number[]
    eventId?: string
  }

  const action = body.action || 'save-tokens'

  if (action === 'save-tokens') {
    if (!body.accessToken) {
      return Response.json({ error: 'accessToken مطلوب' }, { status: 400 })
    }
    const result = await upsertGoogleTokens({
      userId: auth.user.id,
      email: body.email || auth.user.email || null,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      scopes: body.scopes || null,
    })
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 })
    }
    return Response.json({ ok: true, connected: true })
  }

  if (action === 'disconnect') {
    const result = await deleteGoogleTokens(auth.user.id)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 })
    }
    return Response.json({ ok: true, connected: false })
  }

  if (action === 'create') {
    try {
      const event = await createCalendarEvent(auth.user.id, {
        summary: String(body.summary || 'موعد'),
        startIso: String(body.startIso),
        endIso: String(body.endIso),
        description: body.description,
        conferenceUrl: body.conferenceUrl,
        reminderMinutes: body.reminderMinutes || [30, 60],
        timeZone: 'Asia/Riyadh',
      })
      return Response.json({ ok: true, event })
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : 'فشل الإنشاء' },
        { status: 500 }
      )
    }
  }

  if (action === 'delete' && body.eventId) {
    try {
      await deleteCalendarEvent(auth.user.id, body.eventId)
      return Response.json({ ok: true, deleted: true })
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : 'فشل الحذف' },
        { status: 500 }
      )
    }
  }

  return Response.json({ error: 'إجراء غير معروف' }, { status: 400 })
}
