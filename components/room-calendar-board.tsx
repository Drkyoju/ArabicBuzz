'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { isTestCalendarTitle } from '@/lib/rooms/calendar-test-noise'
import { cn } from '@/lib/utils'

type RoomEvent = {
  id: string
  titleAr: string
  descriptionAr: string | null
  startsAt: string
  endsAt: string
  allDay?: boolean
  locationAr?: string | null
  attendees: string[]
  source: string
  createdByAr: string | null
  status: string
  googleEventId?: string | null
  meta?: Record<string, unknown>
}

type ConflictInfo = {
  eventId: string
  titleAr: string
  startsAt: string
  endsAt: string
  overlapMinutes: number
}

type DuplicateGroup = {
  kind: string
  labelAr: string
  events: Array<{
    eventId: string
    titleAr: string
    startsAt: string
    createdByAr: string | null
  }>
}

type AgendaDay = {
  offset: number
  ymd: string
  labelAr: string
  weekdayAr: string
  events: RoomEvent[]
}

const TZ = 'Asia/Riyadh'

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      timeZone: TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtTimeOnly(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ar-SA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toDateInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toTimeInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Combine local date + time into ISO (browser local → ISO). */
function combineLocalDateTime(dateYmd: string, hm: string) {
  return new Date(`${dateYmd}T${hm}:00`).toISOString()
}

function riyadhAllDayIso(ymd: string) {
  return {
    startsAt: new Date(`${ymd}T00:00:00+03:00`).toISOString(),
    endsAt: new Date(`${ymd}T23:59:00+03:00`).toISOString(),
  }
}

const REMINDER_OPTIONS: Array<{ value: number; labelAr: string }> = [
  { value: 30, labelAr: 'قبل ٣٠ دقيقة' },
  { value: 60, labelAr: 'قبل ساعة' },
  { value: 120, labelAr: 'قبل ساعتين' },
  { value: 1440, labelAr: 'قبل يوم' },
]

function riyadhYmd(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function dayBoundsYmd(offsetDays: number) {
  const fmtYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const base = new Date(Date.now() + offsetDays * 86400_000)
  return fmtYmd.format(base)
}

function dayLabelAr(offset: number) {
  if (offset === 0) return 'اليوم'
  if (offset === 1) return 'غداً'
  if (offset === 2) return 'بعد غد'
  return `بعد ${offset} أيام`
}

function weekdayAr(ymd: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${ymd}T12:00:00+03:00`))
  } catch {
    return ymd
  }
}

function overlapMins(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime())
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime())
  return Math.max(0, Math.round((end - start) / 60_000))
}

/**
 * Shared room calendar board — belongs to everyone in the room + AI.
 * Not tied to one person's Google account.
 */
export function RoomCalendarBoard({
  scopeId: scopeIdProp,
}: {
  scopeId?: string
}) {
  const storeScope = useWorkspaceStore((s) => s.activeScopeId)
  // Team board never binds to a personal desk — shared association calendar only.
  const scopeId = teamCalendarScopeId(scopeIdProp || storeScope || PRIMARY_TEAM_SCOPE_ID)
  const signedIn = useSignedIn()
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [suggestionAr, setSuggestionAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [titleAr, setTitleAr] = useState('')
  const [eventDate, setEventDate] = useState(() => toDateInput())
  const [startTime, setStartTime] = useState(() => toTimeInput())
  const [endTime, setEndTime] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    return toTimeInput(d)
  })
  const [allDay, setAllDay] = useState(false)
  const [locationAr, setLocationAr] = useState('')
  const [descriptionAr, setDescriptionAr] = useState('')
  const [reminderMinutes, setReminderMinutes] = useState(60)
  const [attendees, setAttendees] = useState('')
  const [bulk, setBulk] = useState('')
  const [formOpen, setFormOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [copyToGoogle, setCopyToGoogle] = useState(false)
  const [publishGoogle, setPublishGoogle] = useState(false)
  const [publishAck, setPublishAck] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [slotBusy, setSlotBusy] = useState(false)
  const [freeSlots, setFreeSlots] = useState<
    Array<{ start: string; end: string; labelAr?: string }>
  >([])
  const [slotMsg, setSlotMsg] = useState('')
  const [deadlinesPreview, setDeadlinesPreview] = useState<
    Array<{ id: string; labelAr: string; daysLeft: number; startsAtAr?: string }>
  >([])

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(
        `/api/rooms/calendar?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        events?: RoomEvent[]
        error?: string
        code?: string
      }
      if (!res.ok) {
        if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
          setEvents([])
          setErr('GUEST')
          return
        }
        throw new Error(data.error || 'تعذّر التحميل')
      }
      setEvents(data.events || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [scopeId])

  const loadSyncPref = useCallback(async () => {
    if (signedIn !== true) {
      setPublishGoogle(false)
      return
    }
    try {
      const res = await fetch(
        `/api/rooms/calendar/sync?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { calendarSyncEnabled?: boolean }
      if (res.ok) {
        setPublishGoogle(Boolean(data.calendarSyncEnabled))
        if (data.calendarSyncEnabled) setPublishAck(true)
      }
    } catch {
      /* ignore */
    }
  }, [scopeId, signedIn])

  const runGoogleSync = useCallback(async () => {
    if (signedIn !== true) return
    setSyncBusy(true)
    try {
      const res = await fetch('/api/rooms/calendar/sync', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'sync_now', scopeId }),
      })
      const data = (await res.json()) as {
        messageAr?: string
        error?: string
        code?: string
      }
      if (res.ok) {
        setMsg(data.messageAr || 'تمت المزامنة من Google')
        await load()
      } else if (data.code !== 'SYNC_DISABLED') {
        setErr(data.error || 'فشلت مزامنة Google')
      }
    } catch {
      /* soft fail */
    } finally {
      setSyncBusy(false)
    }
  }, [scopeId, signedIn, load])

  const suggestFreeSlots = useCallback(async () => {
    if (signedIn !== true) return
    setSlotBusy(true)
    setSlotMsg('')
    setFreeSlots([])
    try {
      const range = allDay
        ? riyadhAllDayIso(eventDate || toDateInput())
        : {
            startsAt: combineLocalDateTime(
              eventDate || toDateInput(),
              startTime || '09:00'
            ),
            endsAt: combineLocalDateTime(
              eventDate || toDateInput(),
              endTime || '10:00'
            ),
          }
      // Prefer room whiteboard slots (always available); Google FreeBusy when linked.
      const roomRes = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'suggest_slots',
          scopeId,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          eventId: editingId || undefined,
        }),
      })
      const roomData = (await roomRes.json()) as {
        slots?: Array<{
          startIso?: string
          endIso?: string
          start?: string
          end?: string
          labelAr?: string
        }>
        error?: string
        messageAr?: string
      }
      if (roomRes.ok && (roomData.slots || []).length > 0) {
        const slots = (roomData.slots || []).map((s) => {
          const start = s.startIso || s.start || ''
          const end = s.endIso || s.end || ''
          return {
            start,
            end,
            labelAr: s.labelAr || (start && end ? `${fmt(start)} → ${fmtTimeOnly(end)}` : start),
          }
        })
        setFreeSlots(slots)
        setSlotMsg(roomData.messageAr || `وُجد ${slots.length} وقتاً من سبورة الغرفة.`)
        return
      }

      if (!googleConnected) {
        setSlotMsg(
          roomData.messageAr ||
            'لا فراغات ظاهرة على سبورة الغرفة. اربط Google لاقتراح FreeBusy.'
        )
        return
      }

      const res = await fetch(
        '/api/google/calendar?action=freebusy&duration=60&max=6',
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        slots?: Array<{
          startIso?: string
          endIso?: string
          start?: string
          end?: string
        }>
        error?: string
        messageAr?: string
        connected?: boolean
      }
      if (!res.ok) throw new Error(data.error || 'تعذّر اقتراح الأوقات')
      const slots = (data.slots || []).map((s) => {
        const start = s.startIso || s.start || ''
        const end = s.endIso || s.end || ''
        return {
          start,
          end,
          labelAr: start && end ? `${fmt(start)} → ${fmtTimeOnly(end)}` : start,
        }
      })
      setFreeSlots(slots)
      setSlotMsg(
        slots.length
          ? `وُجد ${slots.length} فراغ مشترك (FreeBusy) — اضغط لتعبئة نموذج الموعد.`
          : data.messageAr ||
              'لا فراغات مشتركة ظاهرة — تأكد من ربط حسابات الأعضاء أو مشاركة FreeBusy.'
      )
    } catch (e) {
      setSlotMsg(e instanceof Error ? e.message : 'فشل اقتراح المواعيد')
    } finally {
      setSlotBusy(false)
    }
  }, [
    signedIn,
    googleConnected,
    scopeId,
    eventDate,
    startTime,
    endTime,
    allDay,
    editingId,
  ])

  const loadDeadlinesPreview = useCallback(async () => {
    if (signedIn !== true) {
      setDeadlinesPreview([])
      return
    }
    try {
      const res = await fetch(
        `/api/rooms/deadlines?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        upcoming?: Array<{
          id: string
          labelAr: string
          daysLeft: number
          startsAt?: string
          startsAtAr?: string
        }>
      }
      const list = (data.upcoming || [])
        .filter((d) => d.daysLeft != null && d.daysLeft <= 30)
        .map((d) => ({
          id: d.id,
          labelAr: d.labelAr,
          daysLeft: d.daysLeft,
          startsAtAr: d.startsAtAr || (d.startsAt ? fmt(d.startsAt) : undefined),
        }))
      setDeadlinesPreview(list.slice(0, 4))
    } catch {
      setDeadlinesPreview([])
    }
  }, [scopeId, signedIn])

  async function setPublishPreference(enabled: boolean) {
    if (signedIn !== true || syncBusy) return
    if (enabled && !publishAck) {
      setErr('وافق أولاً على مشاركة مواعيدك القادمة مع فريق الغرفة.')
      return
    }
    setSyncBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/calendar/sync', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'set_preference',
          scopeId,
          enabled,
          acknowledged: enabled ? true : undefined,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        calendarSyncEnabled?: boolean
      }
      if (!res.ok) throw new Error(data.error || 'تعذّر حفظ التفضيل')
      setPublishGoogle(Boolean(data.calendarSyncEnabled))
      setMsg(data.messageAr || (enabled ? 'تم التفعيل' : 'تم الإيقاف'))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setSyncBusy(false)
    }
  }

  useEffect(() => {
    // Wait for session resolve so we don't mark GUEST from a token-less probe.
    if (signedIn === null) return
    if (signedIn === false) {
      setEvents([])
      setErr('GUEST')
      setLoading(false)
      return
    }
    void load()
    void loadDeadlinesPreview()
    try {
      localStorage.setItem('ab-room-collab-seen', '1')
      window.dispatchEvent(new Event('ab-room-collab-seen'))
    } catch {
      /* ignore */
    }
  }, [load, loadDeadlinesPreview, signedIn])

  useEffect(() => {
    if (signedIn !== true) {
      setGoogleConnected(false)
      setCopyToGoogle(false)
      setPublishGoogle(false)
      return
    }
    let cancelled = false
    void (async () => {
      const headers = await authHeaders()
      const statusPromise = fetch('/api/google/calendar?action=status', {
        headers,
      })
        .then(async (res) => {
          const data = (await res.json()) as { connected?: boolean }
          return Boolean(data.connected)
        })
        .catch(() => false)
      const syncPromise = loadSyncPref()
      const connected = await statusPromise
      if (!cancelled) setGoogleConnected(connected)
      await syncPromise
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn, loadSyncPref])

  useEffect(() => {
    if (signedIn !== true || !publishGoogle || !googleConnected) return
    void runGoogleSync()
    // On-demand sync when opening team calendar with opt-in enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per room/opt-in flip
  }, [signedIn, publishGoogle, googleConnected, scopeId])

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.status !== 'cancelled')
        .sort((a, b) => {
          const t = a.startsAt.localeCompare(b.startsAt)
          if (t) return t
          return (a.createdByAr || '').localeCompare(b.createdByAr || '', 'ar')
        }),
    [events]
  )

  const hasTestCalendarNoise = useMemo(
    () => upcoming.some((e) => isTestCalendarTitle(e.titleAr)),
    [upcoming]
  )

  /** اليوم + غداً فقط — لوحات كبيرة دائماً */
  const focusDays = useMemo((): AgendaDay[] => {
    const byYmd = new Map<string, RoomEvent[]>()
    for (const e of upcoming) {
      const ymd = riyadhYmd(e.startsAt)
      const list = byYmd.get(ymd) || []
      list.push(e)
      byYmd.set(ymd, list)
    }
    return [0, 1].map((offset) => {
      const ymd = dayBoundsYmd(offset)
      return {
        offset,
        ymd,
        labelAr: dayLabelAr(offset),
        weekdayAr: weekdayAr(ymd),
        events: byYmd.get(ymd) || [],
      }
    })
  }, [upcoming])

  const currentYm = useMemo(() => dayBoundsYmd(0).slice(0, 7), [])

  /** باقي الشهر الحالي فقط (بعد غد) — قائمة مضغوطة بالتاريخ */
  const monthRestGroups = useMemo((): AgendaDay[] => {
    const tomorrowYmd = dayBoundsYmd(1)
    const byYmd = new Map<string, RoomEvent[]>()
    for (const e of upcoming) {
      const ymd = riyadhYmd(e.startsAt)
      if (ymd <= tomorrowYmd) continue
      if (!ymd.startsWith(currentYm)) continue
      const list = byYmd.get(ymd) || []
      list.push(e)
      byYmd.set(ymd, list)
    }
    return Array.from(byYmd.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ymd, events], i) => ({
        offset: 2 + i,
        ymd,
        labelAr: weekdayAr(ymd),
        weekdayAr: weekdayAr(ymd),
        events,
      }))
  }, [upcoming, currentYm])

  /** مواعيد بعد نهاية الشهر الحالي → التقويم الكامل */
  const beyondMonthCount = useMemo(() => {
    const tomorrowYmd = dayBoundsYmd(1)
    return upcoming.filter((e) => {
      const ymd = riyadhYmd(e.startsAt)
      return ymd > tomorrowYmd && !ymd.startsWith(currentYm)
    }).length
  }, [upcoming, currentYm])

  function openFullCalendar() {
    window.dispatchEvent(
      new CustomEvent('ab-nav', { detail: 'calendar:full' })
    )
  }

  const conflictIds = useMemo(() => {
    const ids = new Set<string>()
    for (let i = 0; i < upcoming.length; i++) {
      for (let j = i + 1; j < upcoming.length; j++) {
        const a = upcoming[i]
        const b = upcoming[j]
        if (new Date(b.startsAt).getTime() >= new Date(a.endsAt).getTime()) break
        if (overlapMins(a.startsAt, a.endsAt, b.startsAt, b.endsAt) > 0) {
          ids.add(a.id)
          ids.add(b.id)
        }
      }
    }
    for (const g of duplicates) {
      for (const e of g.events) ids.add(e.eventId)
    }
    return ids
  }, [upcoming, duplicates])

  function resetForm() {
    setEditingId(null)
    setTitleAr('')
    setAttendees('')
    setLocationAr('')
    setDescriptionAr('')
    setAllDay(false)
    setReminderMinutes(60)
    setCopyToGoogle(false)
    const now = new Date()
    setEventDate(toDateInput(now))
    setStartTime(toTimeInput(now))
    const end = new Date(now)
    end.setHours(end.getHours() + 1)
    setEndTime(toTimeInput(end))
  }

  function startEdit(e: RoomEvent) {
    setEditingId(e.id)
    setTitleAr(e.titleAr)
    const s = new Date(e.startsAt)
    const en = new Date(e.endsAt)
    setEventDate(toDateInput(s))
    setStartTime(toTimeInput(s))
    setEndTime(toTimeInput(en))
    setAllDay(Boolean(e.allDay))
    setLocationAr(e.locationAr || '')
    setDescriptionAr(e.descriptionAr || '')
    const rem = e.meta?.reminderMinutes
    setReminderMinutes(
      typeof rem === 'number' && rem > 0 ? rem : 60
    )
    setAttendees((e.attendees || []).join(', '))
    setFormOpen(true)
    setMsg('')
    setErr('')
  }

  function resolveEventTimes(): { startsAtIso: string; endsAtIso: string } {
    if (allDay) {
      return riyadhAllDayIso(eventDate || toDateInput())
    }
    const ymd = eventDate || toDateInput()
    const st = startTime || '09:00'
    const et = endTime || '10:00'
    return {
      startsAtIso: combineLocalDateTime(ymd, st),
      endsAtIso: combineLocalDateTime(ymd, et),
    }
  }

  async function saveEvent() {
    if (!titleAr.trim() || busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
    setSuggestionAr('')
    try {
      const { startsAtIso, endsAtIso } = resolveEventTimes()
      const attendeeList = attendees
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'))
      if (editingId) {
        const res = await fetch('/api/rooms/calendar', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            action: 'update',
            scopeId,
            eventId: editingId,
            patch: {
              titleAr: titleAr.trim(),
              startsAt: startsAtIso,
              endsAt: endsAtIso,
              allDay,
              locationAr: locationAr.trim() || null,
              descriptionAr: descriptionAr.trim() || null,
              reminderMinutes,
              attendees: attendeeList,
            },
          }),
        })
        const data = (await res.json()) as {
          error?: string
          messageAr?: string
          conflicts?: ConflictInfo[]
        }
        if (!res.ok) throw new Error(data.error || 'فشل التحديث')
        setMsg(data.messageAr || 'تم التحديث')
        setConflicts(Array.isArray(data.conflicts) ? data.conflicts : [])
        resetForm()
      } else {
        const res = await fetch('/api/rooms/calendar', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            action: 'create',
            scopeId,
            titleAr: titleAr.trim(),
            startsAt: startsAtIso,
            endsAt: endsAtIso,
            allDay,
            locationAr: locationAr.trim() || undefined,
            descriptionAr: descriptionAr.trim() || undefined,
            reminderMinutes,
            attendees: attendeeList,
            source: 'manual',
            copyToGoogle: copyToGoogle && googleConnected,
          }),
        })
        const data = (await res.json()) as {
          error?: string
          messageAr?: string
          conflicts?: ConflictInfo[]
          suggestion?: { messageAr?: string } | null
        }
        if (!res.ok) throw new Error(data.error || 'فشل الإضافة')
        setMsg(data.messageAr || 'تمت الإضافة')
        setConflicts(Array.isArray(data.conflicts) ? data.conflicts : [])
        setSuggestionAr(data.suggestion?.messageAr || '')
        resetForm()
      }
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function ingestBulk() {
    const lines = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.length || busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
    try {
      const proposals = lines.map((line) => {
        const parts = line.split('|').map((p) => p.trim())
        const title = parts[0] || 'موعد'
        const start = parts[1]
          ? new Date(parts[1]).toISOString()
          : new Date().toISOString()
        const end = parts[2]
          ? new Date(parts[2]).toISOString()
          : new Date(Date.now() + 3600_000).toISOString()
        return {
          titleAr: title,
          startsAt: start,
          endsAt: end,
          fromEmail: parts[3]?.includes('@') ? parts[3] : undefined,
        }
      })
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'ingest',
          scopeId,
          proposals,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الدمج')
      setMsg(data.messageAr || 'تم الدمج')
      setBulk('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function reconcile(autoAdjust: boolean) {
    if (busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
    setDuplicates([])
    try {
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'reconcile',
          scopeId,
          autoAdjust,
          notify: true,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        conflicts?: Array<{ a: ConflictInfo; b: ConflictInfo }>
        duplicates?: DuplicateGroup[]
      }
      if (!res.ok) throw new Error(data.error || 'فشل الترتيب')
      setMsg(data.messageAr || 'تم الترتيب')
      const flat: ConflictInfo[] = []
      for (const p of data.conflicts || []) {
        if (p?.b) flat.push(p.b)
      }
      setConflicts(flat)
      setDuplicates(Array.isArray(data.duplicates) ? data.duplicates : [])
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    if (signedIn !== true) return
    setBusy(true)
    try {
      await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'cancel', scopeId, eventId: id }),
      })
      if (editingId === id) resetForm()
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function cleanupTestEvents() {
    if (signedIn !== true) return
    if (
      !window.confirm(
        'إلغاء مواعيد الاختبار الظاهرة في التقويم (مثل «اختبار تقويم الفريق»)؟'
      )
    ) {
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'cleanup_test', scopeId }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل التنظيف')
      setMsg(data.messageAr || 'تم التنظيف')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  const sourceLabel = (e: RoomEvent) =>
    e.source === 'ai'
      ? 'وكيل'
      : e.source === 'email'
        ? 'بريد'
        : e.source === 'import'
          ? 'استيراد'
          : e.source === 'google_sync'
            ? `من Google${e.createdByAr ? ` · ${e.createdByAr}` : ''}`
            : 'موعد فريق'

  /** Wait for session resolve before guest CTA; ignore stale GUEST once signed in. */
  const sessionPending = signedIn === null
  const isGuest = signedIn === false || (signedIn === true && err === 'GUEST')

  function renderEventRow(e: RoomEvent) {
    return (
      <li
        key={e.id}
        className={cn(
          'flex flex-wrap items-start justify-between gap-2 rounded-lg border border-ab-border/70 bg-stone-50/80 px-2.5 py-2',
          conflictIds.has(e.id) && 'border-amber-300 bg-amber-50/70',
          editingId === e.id && 'ring-1 ring-ab-accent/40'
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ab-ink">
            {e.titleAr}
            {conflictIds.has(e.id) && (
              <span className="ms-2 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                <AlertTriangle className="h-3 w-3" />
                تعارض
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {fmtTimeOnly(e.startsAt)} → {fmtTimeOnly(e.endsAt)}
          </p>
          {e.attendees?.length > 0 && (
            <p className="mt-0.5 truncate text-[10px] text-ab-muted" dir="ltr">
              مدعوون: {e.attendees.join(', ')}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
            <span
              className={cn(
                'rounded px-1.5 py-0.5',
                e.source === 'ai'
                  ? 'bg-emerald-50 text-emerald-900'
                  : e.source === 'email'
                    ? 'bg-amber-50 text-amber-900'
                    : e.source === 'google_sync'
                      ? 'bg-sky-50 text-sky-900'
                      : 'bg-stone-100 text-stone-600'
              )}
            >
              {sourceLabel(e)}
            </span>
            {e.source !== 'google_sync' && e.createdByAr && (
              <span className="text-ab-muted-soft">بواسطة {e.createdByAr}</span>
            )}
          </div>
        </div>
        {signedIn === true && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => startEdit(e)}
              className="rounded p-1.5 text-ab-muted-soft hover:bg-white hover:text-ab-ink"
              aria-label="تعديل"
              title="تعديل الموعد"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel(e.id)}
              className="rounded p-1.5 text-ab-muted-soft hover:bg-red-50 hover:text-red-700"
              aria-label="إلغاء"
              title="إلغاء من اللوحة"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <section className="space-y-4" dir="rtl">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-ab-ink">
          <CalendarDays className="h-5 w-5 text-ab-accent" aria-hidden />
          تقويم الفريق
        </h2>
        <p className="ab-subtitle !mt-0">
          مواعيد الجمعية = التقويم المشترك للغرفة — يراه الجميع ويُضاف إليه من
          الموقع أو تيليجرام بلا ربط Google. تقويم Google الشخصي اختياري ومنفصل.
        </p>
      </div>

      {signedIn === true && googleConnected && (
        <div className="rounded-xl border border-ab-border bg-ab-accent/10 px-4 py-3">
          <p className="text-sm font-semibold text-ab-ink">
            انشر مواعيدي من Google في تقويم الفريق
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ab-muted">
            اختياري ومتوقف افتراضياً. عند التفعيل تُنسَخ مواعيدك القادمة (حوالي
            ٣ أسابيع من التقويم الرئيسي) إلى تقويم الغرفة ويراها الأعضاء — مع
            وسم «من Google · اسمك». التعديل أو الإلغاء في Google يُحدَّث هنا في
            المزامنة التالية.
          </p>
          {!publishGoogle && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-ab-ink">
              <input
                type="checkbox"
                checked={publishAck}
                onChange={(e) => setPublishAck(e.target.checked)}
                className="mt-0.5 rounded border-ab-border"
              />
              <span>
                أوافق على مشاركة مواعيدي القادمة من Google مع فريق هذه الغرفة.
              </span>
            </label>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncBusy || (!publishGoogle && !publishAck)}
              onClick={() => void setPublishPreference(!publishGoogle)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40',
                publishGoogle
                  ? 'border border-sky-300 bg-white text-sky-900'
                  : 'bg-sky-800 text-white'
              )}
            >
              {publishGoogle ? 'إيقاف النشر من Google' : 'تفعيل النشر من Google'}
            </button>
            {publishGoogle && (
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => void runGoogleSync()}
                className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-[11px] text-sky-900 disabled:opacity-40"
              >
                <RefreshCw
                  className={cn('h-3 w-3', syncBusy && 'animate-spin')}
                />
                مزامنة الآن
              </button>
            )}
          </div>
        </div>
      )}

      {signedIn === true && !googleConnected && (
        <p className="rounded-xl border border-dashed border-ab-border bg-white px-4 py-3 text-[11px] text-stone-500">
          لربط Google ونشر مواعيدك اختيارياً في تقويم الفريق، افتح تبويب «خارجي
          (Google)» واربط حسابك أولاً.
        </p>
      )}

      {signedIn === true && (
        <div className="rounded-xl border border-ab-border bg-white px-4 py-3">
          <p className="text-sm font-semibold text-ab-ink">
            اقتراح أوقات اجتماع
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            من سبورة تقويم الغرفة عند التعارض أو لإيجاد فراغ — وFreeBusy من
            Google إن كان مربوطاً.
          </p>
          <button
            type="button"
            disabled={slotBusy}
            onClick={() => void suggestFreeSlots()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Sparkles className={cn('h-3.5 w-3.5', slotBusy && 'animate-pulse')} />
            {slotBusy ? 'جاري البحث…' : 'اقترح أوقاتاً متاحة'}
          </button>
          {slotMsg && (
            <p className="mt-2 text-[11px] text-stone-600">{slotMsg}</p>
          )}
          {freeSlots.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {freeSlots.map((s) => (
                <li key={`${s.start}-${s.end}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (s.start) {
                        const d = new Date(s.start)
                        setEventDate(toDateInput(d))
                        setStartTime(toTimeInput(d))
                      }
                      if (s.end) {
                        const d = new Date(s.end)
                        setEndTime(toTimeInput(d))
                      }
                      setAllDay(false)
                      setFormOpen(true)
                      setMsg('تم تعبئة وقت مقترح — أكمل العنوان واحفظ.')
                    }}
                    className="w-full rounded-md border border-ab-border bg-stone-50 px-2.5 py-1.5 text-right text-[11px] font-medium text-ab-ink hover:border-ab-accent/40"
                  >
                    {s.labelAr || s.start}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {signedIn === true && deadlinesPreview.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            مواعيد نظامية قريبة
          </p>
          <ul className="mt-2 space-y-1">
            {deadlinesPreview.map((d) => (
              <li
                key={d.id}
                className="text-[11px] text-amber-950/90"
              >
                {d.labelAr}
                {d.daysLeft != null ? ` · متبقّي ${d.daysLeft} يوم` : ''}
                {d.startsAtAr ? ` · ${d.startsAtAr}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-amber-900/70">
            تذكيرات تيليجرام تعمل عبر Cron عند ضبط البوت — عدّل التواريخ من لوحة
            المواعيد النظامية.
          </p>
        </div>
      )}

      {sessionPending ? (
        <p className="rounded-xl border border-ab-border bg-white px-4 py-3 text-sm text-stone-500">
          جاري التحقق من الحساب…
        </p>
      ) : isGuest ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-5 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            سجّل الدخول لإضافة مواعيد لتقويم الفريق
          </p>
          <p className="mt-1 text-xs text-stone-600">
            الزائر يرى الواجهة فقط — لا مواعيد وهمية. بعد الدخول يظهر تقويم
            الغرفة المشترك ويمكنك الضغط «أضف موعد».
          </p>
          <Link
            href="/auth/login"
            className="mt-3 inline-flex rounded-md bg-ab-accent px-4 py-2 text-xs font-semibold text-white"
          >
            سجّل الدخول
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ab-ink">
              {editingId ? 'تعديل موعد' : 'إضافة موعد'}
            </h3>
            <div className="flex items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="inline-flex items-center gap-1 text-[11px] text-stone-500"
                >
                  <X className="h-3 w-3" />
                  إلغاء التعديل
                </button>
              )}
              <button
                type="button"
                onClick={() => setFormOpen((v) => !v)}
                className="text-[11px] text-ab-accent"
              >
                {formOpen ? 'إخفاء النموذج' : 'إظهار النموذج'}
              </button>
            </div>
          </div>
          {formOpen && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-stone-500 sm:col-span-2">
                  العنوان
                  <input
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    placeholder="أضف عنواناً"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-xs text-stone-500">
                  التاريخ
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    dir="ltr"
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="rounded border-ab-border"
                  />
                  طوال اليوم
                </label>
                {!allDay && (
                  <>
                    <label className="block text-xs text-stone-500">
                      من
                      <input
                        type="time"
                        className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        dir="ltr"
                      />
                    </label>
                    <label className="block text-xs text-stone-500">
                      إلى
                      <input
                        type="time"
                        className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        dir="ltr"
                      />
                    </label>
                  </>
                )}
                <label className="block text-xs text-stone-500 sm:col-span-2">
                  المكان (اختياري)
                  <input
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={locationAr}
                    onChange={(e) => setLocationAr(e.target.value)}
                    placeholder="قاعة الاجتماعات · رابط Zoom…"
                  />
                </label>
                <label className="block text-xs text-stone-500 sm:col-span-2">
                  الوصف (اختياري)
                  <textarea
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={descriptionAr}
                    onChange={(e) => setDescriptionAr(e.target.value)}
                    rows={2}
                    placeholder="أجندة مختصرة أو ملاحظات للفريق"
                  />
                </label>
                <label className="block text-xs text-stone-500 sm:col-span-2">
                  مدعوون بأي بريد (اختياري)
                  <input
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    placeholder="sara@company.sa, ahmed@gmail.com"
                    dir="ltr"
                  />
                  <span className="mt-1 block text-[10px] text-ab-muted-soft">
                    يُحفظ مع الموعد في التقويم المشترك ويظهر للفريق — بلا دعوة
                    Google إجبارية.
                  </span>
                </label>
                <label className="block text-xs text-stone-500 sm:col-span-2">
                  تذكير تيليجرام قبل الموعد
                  <select
                    className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                    value={reminderMinutes}
                    onChange={(e) =>
                      setReminderMinutes(Number(e.target.value) || 60)
                    }
                  >
                    {REMINDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelAr}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] text-ab-muted-soft">
                    يُرسل للمجموعة عند تفعيل{' '}
                    <span dir="ltr" className="font-mono">
                      TELEGRAM_GROUP_APPOINTMENT_REMINDERS
                    </span>{' '}
                    — رسالة واحدة لكل موعد.
                  </span>
                </label>
              </div>
              {!editingId && googleConnected && (
                <div className="mt-2 rounded-md border border-dashed border-ab-border bg-white/70 px-2.5 py-2">
                  <label className="flex items-start gap-2 text-xs text-stone-700">
                    <input
                      type="checkbox"
                      checked={copyToGoogle}
                      onChange={(e) => setCopyToGoogle(e.target.checked)}
                      className="mt-0.5 rounded border-ab-border"
                    />
                    <span>
                      <span className="font-semibold">
                        نسخة خاصة في Google (اختياري)
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
                        يُنسخ إلى تقويمك أنت فقط إن كان مربوطاً — لا يستبدل
                        تقويم الفريق المشترك، ولا يُضاف لتقويم عضو آخر.
                      </span>
                    </span>
                  </label>
                </div>
              )}
              <button
                type="button"
                disabled={busy || !titleAr.trim() || signedIn !== true}
                title={
                  !titleAr.trim() ? 'اكتب عنوان الموعد أولاً' : undefined
                }
                onClick={() => void saveEvent()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {editingId ? (
                  <>
                    <Pencil className="h-4 w-4" />
                    حفظ التعديل
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    حفظ
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {conflicts.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            تعارض وقت — {conflicts.length} موعد متداخل
          </p>
          <ul className="mt-2 space-y-1">
            {conflicts.slice(0, 5).map((c) => (
              <li key={c.eventId}>
                «{c.titleAr}» · تداخل {c.overlapMinutes} د · {fmt(c.startsAt)}
              </li>
            ))}
          </ul>
          {suggestionAr && (
            <p className="mt-2 text-amber-900">{suggestionAr}</p>
          )}
          {signedIn === true && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcile(true)}
                className="rounded-md bg-amber-800 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                سوِّ التعارضات تلقائياً ونبّه الغرفة
              </button>
              <button
                type="button"
                disabled={slotBusy}
                onClick={() => void suggestFreeSlots()}
                className="rounded-md border border-amber-700/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 disabled:opacity-40"
              >
                اقترح أوقاتاً بديلة
              </button>
            </div>
          )}
        </div>
      )}

      {duplicates.filter(
        (d) => d.kind === 'exact_copy' || d.kind === 'same_title_near_time'
      ).length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-xs text-violet-950"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            تكرار محتمل — راجع النسخ على السبورة
          </p>
          <ul className="mt-2 space-y-2">
            {duplicates
              .filter(
                (d) =>
                  d.kind === 'exact_copy' || d.kind === 'same_title_near_time'
              )
              .slice(0, 4)
              .map((g, i) => (
                <li key={`${g.kind}-${i}`}>
                  <span className="font-medium">{g.labelAr}</span>
                  <ul className="mt-0.5 space-y-0.5 text-violet-900/80">
                    {g.events.slice(0, 3).map((e) => (
                      <li key={e.eventId}>
                        «{e.titleAr}»
                        {e.createdByAr ? ` · ${e.createdByAr}` : ''} ·{' '}
                        {fmt(e.startsAt)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-[11px] text-violet-900/70">
            التسوية التلقائية لا تحذف التكرار — ألغِ أو عدّل النسخة الزائدة يدوياً.
          </p>
        </div>
      )}

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && err !== 'GUEST' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 shrink text-sm font-semibold text-ab-ink">
              السبورة · {upcoming.length} موعد
          </h3>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            {signedIn === true && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcile(false)}
                className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-ab-ink disabled:opacity-40"
                title="ترتيب حسب التاريخ ومن أضاف + كشف التعارض والتكرار"
              >
                <RefreshCw className="h-3 w-3" />
                رتّب وكشّف التعارض والتكرار
              </button>
            )}
            {signedIn === true && canAccessOpsUi && hasTestCalendarNoise && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cleanupTestEvents()}
                className="inline-flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-950 disabled:opacity-40"
                title="للمالك فقط: إلغاء مواعيد الاختبار من التقويم"
              >
                <Trash2 className="h-3 w-3" />
                تنظيف مواعيد الاختبار
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="text-[11px] text-ab-accent"
            >
              تحديث
            </button>
          </div>
        </div>

        {sessionPending || (loading && signedIn === true) ? (
          <p className="rounded-xl border border-ab-border bg-white p-4 text-sm text-stone-500">
            {sessionPending ? 'جاري التحقق من الحساب…' : 'جاري تحميل المواعيد…'}
          </p>
        ) : isGuest ? (
          <p className="rounded-xl border border-ab-border bg-white p-6 text-center text-sm text-stone-500">
            مواعيد الغرفة المحفوظة تحتاج حساباً.{' '}
            <Link
              href="/auth/login"
              className="font-semibold text-ab-accent underline"
            >
              سجّل الدخول
            </Link>{' '}
            لرؤيتها.
          </p>
        ) : (
          <>
            {/* اليوم + غداً — لوحات كبيرة فقط */}
            <div className="grid gap-3 sm:grid-cols-2">
              {focusDays.map((day) => (
                <div
                  key={day.ymd}
                  className={cn(
                    'rounded-xl border border-ab-border bg-white p-3',
                    day.offset === 0 && 'ring-1 ring-ab-accent/30'
                  )}
                >
                  <p className="text-sm font-bold text-ab-ink">{day.labelAr}</p>
                  <p className="text-[10px] text-ab-muted-soft">{day.weekdayAr}</p>
                  {day.events.length === 0 ? (
                    <p className="mt-2 text-[11px] text-ab-muted-soft">لا مواعيد</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {day.events.map((e) => renderEventRow(e))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {/* باقي الشهر الحالي — قائمة مضغوطة بالتاريخ (بدون مربعات فارغة) */}
            {monthRestGroups.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold text-stone-500">
                  باقي هذا الشهر
                </h4>
                <ul className="divide-y divide-ab-border overflow-hidden rounded-xl border border-ab-border bg-white">
                  {monthRestGroups.map((day) =>
                    day.events.map((e) => (
                      <li
                        key={e.id}
                        className={cn(
                          'flex flex-wrap items-start justify-between gap-2 px-3 py-2',
                          conflictIds.has(e.id) && 'bg-amber-50/50'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-stone-500">
                            {day.weekdayAr}
                          </p>
                          <p className="truncate text-[12px] font-medium text-ab-ink">
                            {e.titleAr}
                          </p>
                          <p className="text-[10px] text-ab-muted-soft">
                            {fmtTimeOnly(e.startsAt)}
                            {conflictIds.has(e.id) ? ' · تعارض' : ''}
                          </p>
                          {e.attendees?.length > 0 && (
                            <p
                              className="truncate text-[10px] text-ab-muted"
                              dir="ltr"
                            >
                              {e.attendees.join(', ')}
                            </p>
                          )}
                        </div>
                        {signedIn === true && (
                          <div className="flex shrink-0 items-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEdit(e)}
                              className="rounded p-1 text-ab-muted-soft hover:bg-stone-50 hover:text-ab-ink"
                              aria-label="تعديل"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void cancel(e.id)}
                              className="rounded p-1 text-ab-muted-soft hover:bg-red-50 hover:text-red-700"
                              aria-label="إلغاء"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ab-border bg-stone-50/70 px-3 py-2.5">
              <p className="text-[11px] text-stone-600">
                {beyondMonthCount > 0
                  ? `${beyondMonthCount} موعد بعد هذا الشهر — اعرضها في التقويم الكامل`
                  : 'كل الأشهر والمواعيد السابقة واللاحقة في التقويم الكامل'}
              </p>
              <button
                type="button"
                onClick={openFullCalendar}
                className="shrink-0 rounded-md bg-ab-ink px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800"
              >
                التقويم الكامل
              </button>
            </div>

            {upcoming.length === 0 && (
              <p className="rounded-xl border border-dashed border-ab-border bg-stone-50/60 p-6 text-center text-sm text-ab-muted-soft">
                لا مواعيد بعد — اضغط «أضف موعد» أعلاه، أو اطلب من الوكيل: «أضف
                اجتماع غداً ١٠ ص إلى تقويم الفريق المشترك».
              </p>
            )}
          </>
        )}
      </div>

      {signedIn === true && (
        <details className="rounded-xl border border-dashed border-ab-border bg-stone-50/80 p-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-stone-700">
            <Sparkles className="h-4 w-4 text-ab-accent" />
            دمج تواريخ من عدة أشخاص (متقدم)
          </summary>
          <p className="mb-2 mt-2 text-[11px] text-stone-500">
            سطر لكل موعد:{' '}
            <code dir="ltr" className="text-[10px]">
              العنوان | 2026-08-05T10:00 | 2026-08-05T11:00 | email@…
            </code>
            — أو اطلب من الوكيل في المحادثة.
          </p>
          <textarea
            className="mb-2 min-h-[5rem] w-full rounded-md border border-ab-border bg-white p-2 font-mono text-[11px]"
            dir="ltr"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={
              'اجتماع مبيعات | 2026-08-06T09:00 | 2026-08-06T10:00 | a@co.sa\nمراجعة عقد | 2026-08-06T09:30 | 2026-08-06T10:30 | b@co.sa'
            }
          />
          <button
            type="button"
            disabled={busy || !bulk.trim()}
            onClick={() => void ingestBulk()}
            className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            دمج وتعديل التعارضات تلقائياً
          </button>
        </details>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-ab-muted-soft">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        المصدر الرسمي لمواعيد الفريق هو تقويم الغرفة المشترك أعلاه. Google
        اختياري فقط كنسخة خاصة لمن يفعّلها — ولا يُكتب في تقويم شخص آخر.
      </p>
    </section>
  )
}
