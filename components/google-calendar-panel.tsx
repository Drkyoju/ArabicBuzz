'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  Unlink,
  Users,
  CopyPlus,
} from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { realEmailsOnly } from '@/lib/auth/synthetic'
import { useTeamCalendarStore } from '@/lib/rooms/team-calendar-store'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

type CalStatus = {
  connected?: boolean
  email?: string | null
  emails?: string[]
  accountCount?: number
  error?: string
}

type EventRow = {
  id: string
  summary: string
  start?: string
  end?: string
  htmlLink?: string
  location?: string
  accountEmail?: string
}

type MeetingRow = {
  id: string
  subject: string
  from: string
  snippet: string
  zoomUrl?: string
  dateHint?: string
}

type DupeGroup = {
  kind: string
  labelAr: string
  events: EventRow[]
}

type FreeSlot = {
  startIso: string
  endIso: string
  durationMinutes: number
}

function formatSlot(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: 'Asia/Riyadh',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function GoogleCalendarPanel({
  hideTitle,
}: {
  /** When true, skip the inner h3 (page already has a heading). */
  hideTitle?: boolean
}) {
  const [status, setStatus] = useState<CalStatus | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [dupes, setDupes] = useState<DupeGroup[]>([])
  const [slots, setSlots] = useState<FreeSlot[]>([])
  const [alignAccounts, setAlignAccounts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [meetTitle, setMeetTitle] = useState('')
  const [meetStart, setMeetStart] = useState('')
  const [meetMinutes, setMeetMinutes] = useState(60)
  const [zoomUrl, setZoomUrl] = useState('')
  const [zoomAuto, setZoomAuto] = useState(false)
  const memberEmails = useTeamCalendarStore((s) => s.memberEmails)
  const addEmail = useTeamCalendarStore((s) => s.addEmail)
  const removeEmail = useTeamCalendarStore((s) => s.removeEmail)
  const setEmails = useTeamCalendarStore((s) => s.setEmails)
  const scopeId = teamCalendarScopeId(
    useWorkspaceStore((s) => s.activeScopeId) || PRIMARY_TEAM_SCOPE_ID
  )
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null)
  const [alsoAddToShared, setAlsoAddToShared] = useState(true)

  const refresh = useCallback(async () => {
    setBusy(true)
    setNote('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/google/calendar?action=status', { headers })
      const data = (await res.json()) as CalStatus
      setStatus(data)
      if (data.connected) {
        const ev = await fetch('/api/google/calendar?action=events&max=12', {
          headers,
        })
        const payload = (await ev.json()) as {
          events?: EventRow[]
          error?: string
        }
        if (ev.ok) setEvents(payload.events || [])
        else setNote(payload.error || 'تعذّر جلب المواعيد')

        const du = await fetch('/api/google/calendar?action=duplicates&max=40', {
          headers,
        })
        const duPayload = (await du.json()) as {
          groups?: DupeGroup[]
          messageAr?: string
          error?: string
        }
        if (du.ok) {
          setDupes(duPayload.groups || [])
          if (duPayload.groups && duPayload.groups.length > 0) {
            setNote(duPayload.messageAr || 'وُجدت مواعيد مكررة أو متعارضة.')
          }
        }
      } else {
        setEvents([])
        setDupes([])
        setSlots([])
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ في التقويم')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { zoomConfigured?: boolean }) =>
        setZoomAuto(Boolean(d.zoomConfigured))
      )
      .catch(() => setZoomAuto(false))
  }, [refresh])

  /** Prefer room member emails over per-browser localStorage list. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/rooms/members?scopeId=${encodeURIComponent(scopeId)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          members?: Array<{ email?: string | null }>
        }
        const fromRoom = realEmailsOnly(
          (data.members || []).map((m) => m.email)
        )
        if (fromRoom.length > 0 && !cancelled) {
          const merged = [
            ...new Set([...fromRoom, ...useTeamCalendarStore.getState().memberEmails]),
          ]
          setEmails(merged)
        }
      } catch {
        /* keep local list */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scopeId, setEmails])

  async function connect() {
    setBusy(true)
    setNote('')
    try {
      if (!isSupabaseConfigured()) {
        setNote('Supabase غير مُعدّ — لا يمكن ربط Google.')
        setBusy(false)
        return
      }
      await connectGoogleCalendar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل بدء الربط'
      setNote(
        /provider is not enabled|Unsupported provider/i.test(msg)
          ? 'مزوّد Google غير مفعّل في Supabase — فعّل Google وأضف Client ID/Secret ثم أعد المحاولة.'
          : msg
      )
      setBusy(false)
    }
  }

  async function disconnect(email?: string) {
    if (
      !window.confirm(
        email
          ? `فصل حساب Google / Gmail ${email}؟`
          : 'فصل كل حسابات Google / Gmail المرتبطة؟'
      )
    ) {
      return
    }
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'disconnect',
          email: email || undefined,
        }),
      })
      const data = (await res.json()) as CalStatus & { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الفصل')
      setStatus(data)
      if (!data.connected) {
        setEvents([])
        setMeetings([])
        setDupes([])
        setSlots([])
      }
      setNote(
        email
          ? `تم فصل ${email}.`
          : 'تم فصل كل حسابات تقويم Google.'
      )
      await refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الفصل')
    } finally {
      setBusy(false)
    }
  }

  async function scanMail() {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar?action=scan-email', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as {
        meetings?: MeetingRow[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل المسح')
      setMeetings(data.meetings || [])
      setNote(
        data.meetings?.length
          ? `عُثر على ${data.meetings.length} رسالة — أضفها من الدردشة أو أنشئ الموعد يدوياً.`
          : 'لا دعوات واضحة في البريد الأخير.'
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل مسح البريد')
    } finally {
      setBusy(false)
    }
  }

  async function findAlignment() {
    setBusy(true)
    setNote('')
    setSlots([])
    try {
      const res = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'align',
          durationMinutes: 60,
          guestEmails: memberEmails,
        }),
      })
      const data = (await res.json()) as {
        slots?: FreeSlot[]
        accounts?: string[]
        guestsUnknown?: string[]
        messageAr?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل المقارنة')
      setSlots(data.slots || [])
      setAlignAccounts(data.accounts || [])
      setNote(
        [
          data.messageAr || 'تمت المقارنة.',
          data.guestsUnknown?.length
            ? `ضيوف بدون فراغ ظاهر (دعوة فقط): ${data.guestsUnknown.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل إيجاد الأوقات المشتركة')
    } finally {
      setBusy(false)
    }
  }

  async function bookSlot(startIso: string, endIso: string) {
    const title = meetTitle.trim() || 'اجتماع الجمعية'
    const guests = memberEmails.length
    if (
      !window.confirm(
        guests > 0
          ? `تأكيد حجز «${title}» وإرسال دعوات لـ ${guests} بريد؟`
          : `تأكيد حجز «${title}» بدون مدعوين؟`
      )
    ) {
      return
    }
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'create',
          summary: title,
          startIso,
          endIso,
          conferenceUrl: zoomUrl.trim() || undefined,
          attendeeEmails: memberEmails,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        event?: { id?: string; htmlLink?: string; summary?: string }
      }
      if (!res.ok) throw new Error(data.error || 'فشل الحجز')

      let sharedNote = ''
      if (alsoAddToShared) {
        try {
          const roomRes = await fetch('/api/rooms/calendar', {
            method: 'POST',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              action: 'create',
              scopeId,
              titleAr: title,
              startsAt: startIso,
              endsAt: endIso,
              locationAr: zoomUrl.trim() || undefined,
              attendees: memberEmails,
              source: 'import',
              reminderMinutes: 60,
            }),
          })
          const roomData = (await roomRes.json()) as {
            messageAr?: string
            error?: string
          }
          sharedNote = roomRes.ok
            ? ' · وأُضيف أيضاً إلى مواعيد الجمعية المشتركة'
            : ` · تعذّرت الإضافة للمشترك: ${roomData.error || ''}`
        } catch {
          sharedNote = ' · تعذّرت الإضافة لمواعيد الجمعية'
        }
      }

      setNote(
        `أُنشئ «${data.event?.summary || 'موعد'}» وأُرسلت دعوات لـ ${memberEmails.length} بريد.${sharedNote}`
      )
      await refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الحجز')
    } finally {
      setBusy(false)
    }
  }

  function fillFromEmail(m: MeetingRow) {
    setMeetTitle(m.subject || 'اجتماع من البريد')
    if (m.zoomUrl) setZoomUrl(m.zoomUrl)
    if (m.dateHint) {
      const parsed = Date.parse(m.dateHint)
      if (Number.isFinite(parsed)) {
        const d = new Date(parsed)
        const pad = (n: number) => String(n).padStart(2, '0')
        setMeetStart(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        )
      }
    }
    setNote('عُبئ النموذج من رسالة البريد — راجع الوقت ثم احجز.')
  }

  async function createManualMeeting() {
    if (!meetTitle.trim() || !meetStart) {
      setNote('أدخل عنوان الموعد ووقت البداية.')
      return
    }
    const start = new Date(meetStart)
    if (!Number.isFinite(start.getTime())) {
      setNote('وقت البداية غير صالح.')
      return
    }
    const end = new Date(start.getTime() + Math.max(15, meetMinutes) * 60_000)
    await bookSlot(start.toISOString(), end.toISOString())
  }

  async function copyEventToShared(ev: EventRow) {
    if (!ev.id) return
    setCopyBusyId(ev.id)
    setNote('')
    try {
      const res = await fetch('/api/rooms/calendar/sync', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'copy_selected',
          scopeId,
          googleEventIds: [ev.id],
        }),
      })
      const data = (await res.json()) as {
        messageAr?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'تعذّر النسخ')
      setNote(
        data.messageAr ||
          `نُسخ «${ev.summary}» إلى مواعيد الجمعية (التقويم المشترك).`
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل النسخ إلى المشترك')
    } finally {
      setCopyBusyId(null)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const session = await getBrowserSession()
        if (
          !(session as { provider_token?: string } | null)?.provider_token ||
          !session?.user?.id
        ) {
          return
        }
        const { persistGoogleProviderTokens } = await import(
          '@/lib/google/persist-provider-tokens'
        )
        await persistGoogleProviderTokens(session)
        await refresh()
      } catch {
        /* ignore */
      }
    })()
  }, [refresh])

  const emails = status?.emails || (status?.email ? [status.email] : [])

  return (
    <div dir="rtl">
      {!hideTitle && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-ab-accent" aria-hidden />
              Google / Gmail · تقويم · Zoom
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              اربط حساب Google Workspace لبريد الجمعية (مثل{' '}
              <span dir="ltr" className="font-mono">
                info@…
              </span>
              ) لقراءة Gmail وإرسال الدعوات. يمكنك ربط أكثر من بريد — في شاشة
              Google اختر الحساب الصحيح دون استبدال تسجيل دخولك. أضف بريد
              المدعوّين أدناه <strong>بدون</strong> تسجيل دخولهم.
            </p>
          </div>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-ab-muted-soft" />}
        </div>
      )}
      {hideTitle && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-xs leading-relaxed text-stone-600">
            لربط بريد الجمعية الرسمي: اضغط «
            {status?.connected ? 'ربط بريد Google إضافي' : 'ربط بريد Google (Gmail)'}
            » ثم في شاشة Google اختر حساب{' '}
            <strong>Workspace</strong> (مثل{' '}
            <span dir="ltr" className="font-mono">
              info@…
            </span>
            ) ووافق على صلاحيات Gmail والتقويم. Microsoft 365 / IMAP غير
            مدعومين هنا.
          </p>
          {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ab-muted-soft" />}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Link2 className="h-3.5 w-3.5" />
          {status?.connected
            ? 'ربط بريد Google إضافي'
            : 'ربط بريد Google (Gmail)'}
        </button>
        {status?.connected && (
          <>
            <button
              type="button"
              onClick={() => void findAlignment()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-accent/40 bg-ab-accent/5 px-3 py-1.5 text-xs text-ab-accent disabled:opacity-40"
            >
              <Users className="h-3.5 w-3.5" />
              أوقات مشتركة للجميع
            </button>
            <button
              type="button"
              onClick={() => void scanMail()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <Mail className="h-3.5 w-3.5" />
              مسح البريد للدعوات
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border px-3 py-1.5 text-xs text-ab-warn disabled:opacity-40"
            >
              <Unlink className="h-3.5 w-3.5" />
              فصل الكل
            </button>
          </>
        )}
      </div>

      {emails.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {emails.map((email) => (
            <li
              key={email}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
            >
              <span dir="ltr">{email}</span>
              <button
                type="button"
                onClick={() => void disconnect(email)}
                className="text-emerald-700/70 hover:text-red-600"
                aria-label={`فصل ${email}`}
                title="فصل هذا البريد"
              >
                <Unlink className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4 rounded-xl border border-ab-border bg-white p-3">
        <p className="mb-2 text-[12px] font-semibold text-ab-ink">
          مدعوّو Google (من أعضاء الغرفة + بريد إضافي)
        </p>
        <p className="mb-2 text-[11px] text-stone-500">
          تُحمَّل تلقائياً من أعضاء الغرفة. أضف بريداً خارجياً فقط لدعوات خارج
          الفريق — التقويم الرسمي هو لوحة الغرفة أعلاه.
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <input
            value={guestInput}
            onChange={(e) => setGuestInput(e.target.value)}
            placeholder="مثال@شركة.sa"
            dir="ltr"
            className="min-w-[12rem] flex-1 rounded-md border border-ab-border px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (!addEmail(guestInput)) {
                setNote('أدخل بريداً صالحاً.')
                return
              }
              setGuestInput('')
              setNote('أُضيف البريد لقائمة الدعوات.')
            }}
            className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
          >
            إضافة
          </button>
        </div>
        {memberEmails.length === 0 ? (
          <p className="text-[11px] text-ab-muted-soft">
            لا بريد بعد — أضف أعضاءً من لوحة الغرفة أو بريداً هنا للدعوات.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {memberEmails.map((email) => (
              <li
                key={email}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-stone-50 px-2 py-1 text-[11px]"
              >
                <span dir="ltr">{email}</span>
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="text-ab-muted-soft hover:text-red-600"
                  aria-label={`حذف ${email}`}
                >
                  <Unlink className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status?.connected && (
        <div className="mb-4 space-y-2 rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-3">
          <p className="text-[12px] font-semibold text-ab-accent">
            حجز اجتماع + Zoom
          </p>
          <input
            value={meetTitle}
            onChange={(e) => setMeetTitle(e.target.value)}
            placeholder="عنوان الاجتماع"
            className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="datetime-local"
              value={meetStart}
              onChange={(e) => setMeetStart(e.target.value)}
              className="rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
              dir="ltr"
            />
            <label className="inline-flex items-center gap-1 text-[11px] text-stone-600">
              المدة (د)
              <input
                type="number"
                min={15}
                max={240}
                value={meetMinutes}
                onChange={(e) => setMeetMinutes(Number(e.target.value) || 60)}
                className="w-16 rounded border border-ab-border px-1 py-0.5 text-center"
                dir="ltr"
              />
            </label>
          </div>
          <input
            value={zoomUrl}
            onChange={(e) => setZoomUrl(e.target.value)}
            placeholder="رابط Zoom (اختياري — يُنشأ تلقائياً إن ضُبط Zoom API)"
            dir="ltr"
            className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-left text-xs font-mono"
          />
          {zoomAuto ? (
            <p className="text-[10px] text-emerald-700">
              إنشاء Zoom تلقائي مفعّل — اترك الحقل فارغاً ليُنشأ الرابط عند الحجز.
            </p>
          ) : (
            <p className="text-[10px] text-ab-muted-soft">
              للصق رابط يدوياً، أو اربط Zoom من الإعدادات.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createManualMeeting()}
              className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              إنشاء وإرسال دعوات
            </button>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-stone-700">
            <input
              type="checkbox"
              checked={alsoAddToShared}
              onChange={(e) => setAlsoAddToShared(e.target.checked)}
              className="mt-0.5 rounded border-ab-border"
            />
            <span>
              أضف أيضاً إلى <strong>مواعيد الجمعية</strong> (التقويم المشترك)
              — مُفعّل افتراضياً حتى يظهر الموعد للفريق وليس في Google فقط.
            </span>
          </label>
        </div>
      )}

      {note && (
        <p className="mb-3 text-[11px] leading-snug text-stone-600">{note}</p>
      )}

      {slots.length > 0 && (
        <div className="mb-3 rounded-md border border-ab-accent/30 bg-ab-accent/5 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-ab-accent">
            فترات مشتركة متاحة
            {alignAccounts.length > 0
              ? ` · ${alignAccounts.length} حساب`
              : ''}
          </p>
          <ul className="space-y-1">
            {slots.map((s) => (
              <li
                key={`${s.startIso}-${s.endIso}`}
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-700"
              >
                <span>
                  {formatSlot(s.startIso)}
                  <span className="text-ab-muted-soft"> — </span>
                  {formatSlot(s.endIso)}
                  <span className="ms-1 text-ab-muted-soft">
                    ({s.durationMinutes} د)
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void bookSlot(s.startIso, s.endIso)}
                  className="rounded border border-ab-accent/40 px-2 py-0.5 text-[10px] text-ab-accent disabled:opacity-40"
                >
                  احجز وأرسل دعوات
                  {zoomAuto && !zoomUrl.trim() ? ' + Zoom' : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dupes.length > 0 && (
        <div className="mb-3 rounded-md border border-ab-warn/40 bg-ab-warn/10 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-ab-warn">
            تكرار / تعارض ({dupes.length})
          </p>
          <ul className="space-y-2">
            {dupes.map((g, i) => (
              <li key={`${g.kind}-${i}`} className="text-[11px] text-stone-700">
                <p className="font-medium">{g.labelAr}</p>
                <ul className="mt-0.5 list-disc pr-4 text-stone-600">
                  {g.events.map((e) => (
                    <li key={e.id}>
                      {e.summary}
                      {e.accountEmail ? (
                        <span className="text-ab-muted-soft" dir="ltr">
                          {' '}
                          · {e.accountEmail}
                        </span>
                      ) : null}
                      {e.start ? (
                        <span className="text-ab-muted-soft" dir="ltr">
                          {' '}
                          · {e.start}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {events.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-ab-border bg-stone-50 px-2.5 py-2 text-[12px]"
            >
              <p className="font-medium text-ab-ink">{e.summary}</p>
              <p className="text-[11px] text-stone-500" dir="ltr">
                {e.accountEmail ? `${e.accountEmail} · ` : ''}
                {e.start || '—'}
                {e.location ? ` · ${e.location}` : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || copyBusyId === e.id}
                  onClick={() => void copyEventToShared(e)}
                  className="inline-flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900 disabled:opacity-40"
                >
                  <CopyPlus className="h-3 w-3" />
                  {copyBusyId === e.id
                    ? 'جاري النسخ…'
                    : 'انسخ إلى مواعيد الجمعية'}
                </button>
                {e.htmlLink && (
                  <a
                    href={e.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-ab-accent underline"
                    dir="ltr"
                  >
                    فتح في Google Calendar
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {meetings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-ab-ink">من البريد</p>
          {meetings.map((m) => (
            <div
              key={m.id}
              className="rounded-md border border-dashed border-ab-border px-2.5 py-2 text-[12px]"
            >
              <p className="font-medium">{m.subject || '(بدون عنوان)'}</p>
              <p className="text-[11px] text-stone-500">{m.from}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                {m.snippet}
              </p>
              {m.zoomUrl && (
                <p className="mt-1 text-[11px] text-ab-accent" dir="ltr">
                  {m.zoomUrl}
                </p>
              )}
              <button
                type="button"
                onClick={() => fillFromEmail(m)}
                className="mt-2 rounded border border-ab-border px-2 py-0.5 text-[10px] text-ab-ink hover:bg-stone-50"
              >
                تعبئة نموذج الحجز
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
