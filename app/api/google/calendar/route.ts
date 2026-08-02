import { requireUser } from '@/lib/auth/session'
import {
  deleteGoogleTokens,
  fetchGoogleAccountEmail,
  listGoogleAccounts,
  upsertGoogleTokens,
} from '@/lib/google/tokens'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  findDuplicateAppointments,
  findMutualFreeSlots,
  listUpcomingEvents,
  scanEmailForMeetings,
} from '@/lib/google/calendar'
import {
  createZoomMeeting,
  isZoomCreateConfigured,
} from '@/lib/zoom/create-meeting'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Status + upcoming events, or save/disconnect tokens. */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'status'
  const accounts = await listGoogleAccounts(auth.user.id)
  const emails = accounts.map((a) => a.email).filter(Boolean) as string[]

  if (action === 'status') {
    return Response.json({
      connected: accounts.length > 0,
      accountCount: accounts.length,
      email: emails[0] || auth.user.email || null,
      emails,
      accounts: accounts.map((a) => ({
        email: a.email,
        scopes: a.scopes,
        updatedAt: a.updated_at,
      })),
    })
  }

  if (accounts.length === 0) {
    return Response.json(
      { error: 'تقويم Google غير مربوط.', connected: false },
      { status: 400 }
    )
  }

  const filterEmails = url.searchParams.get('emails')
    ? url.searchParams.get('emails')!.split(',').map((e) => e.trim())
    : undefined

  try {
    if (action === 'events') {
      const events = await listUpcomingEvents(auth.user.id, {
        maxResults: Number(url.searchParams.get('max') || 20),
        query: url.searchParams.get('q') || undefined,
        emails: filterEmails,
      })
      return Response.json({ connected: true, emails, events })
    }
    if (action === 'scan-email') {
      const meetings = await scanEmailForMeetings(auth.user.id)
      return Response.json({ connected: true, meetings })
    }
    if (action === 'duplicates') {
      const report = await findDuplicateAppointments(auth.user.id, {
        maxResults: Number(url.searchParams.get('max') || 40),
      })
      return Response.json({ connected: true, ...report })
    }
    if (action === 'align' || action === 'freebusy') {
      const result = await findMutualFreeSlots(auth.user.id, {
        emails: filterEmails,
        durationMinutes: Number(url.searchParams.get('duration') || 60),
        timeMinIso: url.searchParams.get('timeMin') || undefined,
        timeMaxIso: url.searchParams.get('timeMax') || undefined,
        maxSlots: Number(url.searchParams.get('max') || 12),
      })
      return Response.json({ connected: true, ...result })
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
    zoomUrl?: string
    reminderMinutes?: number[]
    eventId?: string
    accountEmail?: string
    emails?: string[]
    guestEmails?: string[]
    attendeeEmails?: string[]
    durationMinutes?: number
    timeMinIso?: string
    timeMaxIso?: string
  }

  const action = body.action || 'save-tokens'

  if (action === 'save-tokens') {
    if (!body.accessToken) {
      return Response.json({ error: 'accessToken مطلوب' }, { status: 400 })
    }
    const googleEmail =
      (await fetchGoogleAccountEmail(body.accessToken)) ||
      body.email ||
      auth.user.email ||
      null
    const result = await upsertGoogleTokens({
      userId: auth.user.id,
      email: googleEmail,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      scopes: body.scopes || null,
    })
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 })
    }
    const accounts = await listGoogleAccounts(auth.user.id)
    return Response.json({
      ok: true,
      connected: true,
      email: result.email,
      emails: accounts.map((a) => a.email),
      accountCount: accounts.length,
    })
  }

  if (action === 'disconnect') {
    const result = await deleteGoogleTokens(
      auth.user.id,
      body.email || body.accountEmail || null
    )
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 })
    }
    const accounts = await listGoogleAccounts(auth.user.id)
    return Response.json({
      ok: true,
      connected: accounts.length > 0,
      emails: accounts.map((a) => a.email),
      accountCount: accounts.length,
    })
  }

  if (action === 'align') {
    try {
      const result = await findMutualFreeSlots(auth.user.id, {
        emails: body.emails,
        guestEmails: body.guestEmails || body.attendeeEmails,
        durationMinutes: body.durationMinutes || 60,
        timeMinIso: body.timeMinIso,
        timeMaxIso: body.timeMaxIso,
      })
      return Response.json({ ok: true, ...result })
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : 'فشل المقارنة' },
        { status: 500 }
      )
    }
  }

  if (action === 'create') {
    try {
      const attendees = [
        ...(Array.isArray(body.attendeeEmails)
          ? body.attendeeEmails.map(String)
          : []),
        ...(Array.isArray(body.guestEmails)
          ? body.guestEmails.map(String)
          : []),
      ].filter((e) => e.includes('@'))

      let conferenceUrl = body.conferenceUrl || body.zoomUrl || undefined
      let zoomCreated: { joinUrl: string; meetingId: number | string } | null =
        null
      if (!conferenceUrl && isZoomCreateConfigured()) {
        const start = new Date(String(body.startIso))
        const end = new Date(String(body.endIso))
        const mins = Math.max(
          15,
          Math.round((end.getTime() - start.getTime()) / 60_000) || 60
        )
        zoomCreated = await createZoomMeeting({
          topic: String(body.summary || 'موعد'),
          startIso: String(body.startIso),
          durationMinutes: mins,
          agenda: body.description,
        })
        conferenceUrl = zoomCreated.joinUrl
      }

      const event = await createCalendarEvent(auth.user.id, {
        summary: String(body.summary || 'موعد'),
        startIso: String(body.startIso),
        endIso: String(body.endIso),
        description: body.description,
        conferenceUrl,
        attendeeEmails: attendees.length ? attendees : undefined,
        reminderMinutes: body.reminderMinutes || [30, 60],
        timeZone: 'Asia/Riyadh',
        accountEmail: body.accountEmail || body.email || undefined,
      })
      return Response.json({
        ok: true,
        event,
        zoom: zoomCreated
          ? { created: true, joinUrl: zoomCreated.joinUrl, id: zoomCreated.meetingId }
          : { configured: isZoomCreateConfigured(), created: false },
      })
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : 'فشل الإنشاء' },
        { status: 500 }
      )
    }
  }

  if (action === 'delete' && body.eventId) {
    try {
      await deleteCalendarEvent(
        auth.user.id,
        body.eventId,
        body.accountEmail || body.email || undefined
      )
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
