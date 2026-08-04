'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Eye, Pencil, Users } from 'lucide-react'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

export type PresencePeer = {
  key: string
  name: string
  email?: string | null
  phone?: string | null
  googleName?: string | null
  anonymous?: boolean
  typing?: boolean
  surface?: string
  status?: 'viewing' | 'away'
  kind?: 'human' | 'agent'
  at?: number
}

export type RoomEditEvent = {
  id: string
  actorAr: string
  actionAr: string
  detailAr?: string
  at: number
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1)
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`
}

function surfaceLabel(s?: string) {
  if (s === 'canvas') return 'اللوحة'
  if (s === 'document') return 'المستند'
  if (s === 'composer') return 'الكتابة'
  if (s === 'calendar') return 'التقويم'
  if (s === 'files') return 'الملفات'
  return 'المحادثة'
}

function relativeAr(at: number) {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (sec < 15) return 'الآن'
  if (sec < 60) return `منذ ${sec} ث`
  const min = Math.round(sec / 60)
  if (min < 60) return `منذ ${min} د`
  const h = Math.round(min / 60)
  return `منذ ${h} س`
}

function peerLabel(p: PresencePeer) {
  if (p.anonymous) return 'مجهول'
  return p.name || p.googleName || p.email || p.phone || 'مجهول'
}

function peerDetail(p: PresencePeer) {
  const bits: string[] = []
  if (p.googleName && p.googleName !== p.name) bits.push(`Google: ${p.googleName}`)
  if (p.email) bits.push(p.email)
  if (p.phone) bits.push(p.phone)
  if (p.anonymous) bits.push('زائر بدون حساب')
  return bits.join(' · ')
}

function identityFromSession(
  session: Awaited<ReturnType<typeof getBrowserSession>>,
  displayName?: string
) {
  const u = session?.user
  const meta = (u?.user_metadata || {}) as Record<string, unknown>
  const email = u?.email || (meta.email as string) || null
  const phone =
    u?.phone ||
    (meta.phone as string) ||
    (meta.phone_number as string) ||
    null
  const googleName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    (meta.preferred_username as string) ||
    null
  let name =
    displayName ||
    googleName ||
    (email ? email.split('@')[0] : null) ||
    (phone ? String(phone) : null) ||
    ''
  try {
    const saved = localStorage.getItem('ab-display-name')
    if (saved?.trim()) name = saved.trim()
  } catch {
    /* ignore */
  }
  const anonymous = !u?.id && !email && !phone
  if (!name) name = anonymous ? 'مجهول' : 'مستخدم'
  return {
    name: String(name),
    email: email ? String(email) : null,
    phone: phone ? String(phone) : null,
    googleName: googleName ? String(googleName) : null,
    anonymous,
    userKey: u?.id || `guest-${stableGuestId()}`,
  }
}

function stableGuestId() {
  try {
    const existing = localStorage.getItem('ab-guest-id')
    if (existing) return existing
    const id = Math.random().toString(36).slice(2, 10)
    localStorage.setItem('ab-guest-id', id)
    return id
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

/**
 * Live room presence: who joined (name/email/phone/Google/anonymous),
 * how many are viewing now, drop on tab close, and recent edits.
 */
export function RoomPresenceBar({
  scopeId,
  typing,
  displayName,
  surface = 'feed',
  compact = false,
  agentTyping = false,
  agentName = 'الوكيل',
}: {
  scopeId: string
  typing: boolean
  displayName?: string
  surface?: string
  compact?: boolean
  agentTyping?: boolean
  agentName?: string
}) {
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [edits, setEdits] = useState<RoomEditEvent[]>([])
  const [open, setOpen] = useState(false)
  const [remoteAgentTyping, setRemoteAgentTyping] = useState<{
    name: string
  } | null>(null)
  const [tick, setTick] = useState(0)

  const channelRef = useRef<{
    track: (payload: Record<string, unknown>) => Promise<unknown>
    untrack: () => Promise<unknown>
  } | null>(null)
  const identityRef = useRef({
    name: displayName || 'مجهول',
    email: null as string | null,
    phone: null as string | null,
    googleName: null as string | null,
    anonymous: true,
    userKey: 'guest',
  })
  const typingRef = useRef(typing)
  const surfaceRef = useRef(surface)
  const statusRef = useRef<'viewing' | 'away'>('viewing')

  const pushEdit = useCallback((ev: RoomEditEvent) => {
    setEdits((prev) => {
      const next = [ev, ...prev.filter((e) => e.id !== ev.id)]
      return next.slice(0, 8)
    })
  }, [])

  useEffect(() => {
    typingRef.current = typing
    surfaceRef.current = surface
  }, [typing, surface])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const trackNow = useCallback(async () => {
    const ch = channelRef.current
    if (!ch?.track) return
    const id = identityRef.current
    await ch.track({
      name: id.name,
      email: id.email,
      phone: id.phone,
      googleName: id.googleName,
      anonymous: id.anonymous,
      typing: typingRef.current,
      surface: surfaceRef.current,
      status: statusRef.current,
      kind: 'human',
      at: Date.now(),
    })
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPeers([
        {
          key: 'local',
          name: displayName || 'أنت',
          anonymous: !displayName || displayName === 'أنت',
          typing,
          surface,
          status: 'viewing',
          kind: 'human',
        },
      ])
      return
    }

    let cancelled = false
    let channel: ReturnType<
      ReturnType<typeof createBrowserSupabaseClient>['channel']
    > | null = null
    const sb = createBrowserSupabaseClient()

    void (async () => {
      const session = await getBrowserSession()
      if (cancelled) return
      identityRef.current = identityFromSession(session, displayName)

      channel = sb.channel(`presence-room:${scopeId}`, {
        config: { presence: { key: identityRef.current.userKey } },
      })
      channelRef.current = {
        track: (payload) => channel!.track(payload),
        untrack: () => channel!.untrack(),
      }

      const syncPeers = () => {
        if (cancelled) return
        const state = channel!.presenceState() as Record<
          string,
          Array<Partial<PresencePeer>>
        >
        const list: PresencePeer[] = Object.entries(state).map(
          ([key, rows]) => {
            const row = rows[0] || {}
            return {
              key,
              name: String(row.name || 'مجهول'),
              email: row.email || null,
              phone: row.phone || null,
              googleName: row.googleName || null,
              anonymous: Boolean(row.anonymous),
              typing: Boolean(row.typing),
              surface: row.surface,
              status: row.status === 'away' ? 'away' : 'viewing',
              kind: row.kind === 'agent' ? 'agent' : 'human',
              at: typeof row.at === 'number' ? row.at : undefined,
            }
          }
        )
        setPeers(list)
      }

      channel.on('presence', { event: 'sync' }, syncPeers)
      channel.on('presence', { event: 'join' }, syncPeers)
      channel.on('presence', { event: 'leave' }, syncPeers)

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          statusRef.current =
            document.visibilityState === 'visible' ? 'viewing' : 'away'
          await trackNow()
        }
      })
    })()

    const onVis = () => {
      statusRef.current =
        document.visibilityState === 'visible' ? 'viewing' : 'away'
      void trackNow()
    }
    const onLeave = () => {
      const ch = channelRef.current
      if (ch?.untrack) void ch.untrack()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      channelRef.current = null
      if (channel) {
        void channel.untrack?.()
        void sb.removeChannel(channel)
      }
    }
  }, [scopeId, displayName, trackNow, pushEdit])

  useEffect(() => {
    void trackNow()
  }, [typing, surface, trackNow])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`agent-typing:${scopeId}`)
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { name?: string; typing?: boolean }
      if (p?.typing) setRemoteAgentTyping({ name: p.name || 'الوكيل' })
      else setRemoteAgentTyping(null)
    })
    void ch.subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [scopeId])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`agent-typing:${scopeId}`)
    void ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: { name: agentName, typing: agentTyping },
        })
      }
    })
    return () => {
      void ch.send({
        type: 'broadcast',
        event: 'typing',
        payload: { name: agentName, typing: false },
      })
      void sb.removeChannel(ch)
    }
  }, [agentTyping, agentName, scopeId])

  // Seed last edits from activity API
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { authHeaders } = await import('@/lib/supabase/browser')
        const res = await fetch(
          `/api/rooms/activity?scopeId=${encodeURIComponent(scopeId)}&limit=40`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          now?: {
            lastCanvasEdit?: {
              titleAr?: string
              updatedBy?: string | null
              at?: number | null
            } | null
            lastHumanMessage?: {
              authorAr?: string
              content?: string
              at?: number
            } | null
          }
        }
        const seeded: RoomEditEvent[] = []
        if (data.now?.lastCanvasEdit?.at) {
          seeded.push({
            id: `canvas-seed-${data.now.lastCanvasEdit.at}`,
            actorAr: data.now.lastCanvasEdit.updatedBy || 'عضو',
            actionAr: 'عدّل اللوحة',
            detailAr: data.now.lastCanvasEdit.titleAr,
            at: data.now.lastCanvasEdit.at,
          })
        }
        if (data.now?.lastHumanMessage?.at) {
          seeded.push({
            id: `msg-seed-${data.now.lastHumanMessage.at}`,
            actorAr: data.now.lastHumanMessage.authorAr || 'عضو',
            actionAr: 'أرسل رسالة',
            detailAr: data.now.lastHumanMessage.content,
            at: data.now.lastHumanMessage.at,
          })
        }
        if (seeded.length) {
          setEdits((prev) => {
            const map = new Map(prev.map((e) => [e.id, e]))
            for (const e of seeded) map.set(e.id, e)
            return [...map.values()]
              .sort((a, b) => b.at - a.at)
              .slice(0, 8)
          })
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scopeId])

  // Live edit feed (separate channel so it doesn't clash with presence)
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`room-edits:${scopeId}`)
    ch.on('broadcast', { event: 'room-edit' }, ({ payload }) => {
      const p = payload as Partial<RoomEditEvent>
      if (!p?.actorAr || !p?.actionAr) return
      pushEdit({
        id: String(p.id || `${p.at}-${p.actorAr}`),
        actorAr: String(p.actorAr),
        actionAr: String(p.actionAr),
        detailAr: p.detailAr ? String(p.detailAr) : undefined,
        at: Number(p.at || Date.now()),
      })
    })
    void ch.subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [scopeId, pushEdit])

  void tick // refresh relative times

  const humans = useMemo(
    () => peers.filter((p) => p.kind !== 'agent'),
    [peers]
  )
  const viewing = useMemo(
    () => humans.filter((p) => p.status !== 'away'),
    [humans]
  )
  const away = useMemo(
    () => humans.filter((p) => p.status === 'away'),
    [humans]
  )

  const online =
    humans.length > 0
      ? humans
      : [
          {
            key: 'self',
            name: displayName || 'أنت',
            status: 'viewing' as const,
            kind: 'human' as const,
            surface,
          },
        ]

  const showAgent = agentTyping || Boolean(remoteAgentTyping)
  const agentDisplay = agentTyping
    ? agentName
    : remoteAgentTyping?.name || 'الوكيل'
  const lastEdit = edits[0]

  const summary = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md text-right transition hover:bg-stone-50',
        compact ? 'px-1 py-0.5' : 'px-1.5 py-1'
      )}
      aria-expanded={open}
      title="من في الغرفة الآن"
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <Eye className="h-3 w-3" aria-hidden />
        {viewing.length || online.filter((p) => p.status !== 'away').length} يشاهدون
      </span>
      <span className="text-[11px] text-stone-400">
        · متصلون {online.length}
        {away.length > 0 ? ` · بعيد ${away.length}` : ''}
      </span>
      <ChevronDown
        className={cn(
          'h-3 w-3 text-stone-400 transition',
          open && 'rotate-180'
        )}
        aria-hidden
      />
    </button>
  )

  const panel = open && (
    <div
      className="absolute start-0 top-full z-30 mt-1 w-[min(100vw-2rem,22rem)] rounded-xl border border-ab-border bg-white p-3 shadow-lg"
      dir="rtl"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ab-ink">
        <Users className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
        من في الغرفة الآن
      </p>
      <ul className="max-h-48 space-y-2 overflow-auto">
        {online.map((p) => (
          <li
            key={p.key}
            className="flex items-start gap-2 rounded-lg border border-ab-border/70 bg-stone-50/80 px-2 py-1.5"
          >
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                p.status === 'away'
                  ? 'bg-stone-400'
                  : p.typing
                    ? 'bg-ab-accent'
                    : 'bg-emerald-700'
              )}
            >
              {initials(peerLabel(p))}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-ab-ink">
                {peerLabel(p)}
                {p.status === 'away' && (
                  <span className="mr-1 text-[10px] font-normal text-stone-400">
                    (بعيد / تبويب مخفي)
                  </span>
                )}
                {p.typing && (
                  <span className="mr-1 text-[10px] font-normal text-ab-accent">
                    يكتب…
                  </span>
                )}
              </p>
              <p className="truncate text-[10px] text-stone-500" dir="ltr">
                {peerDetail(p) || 'بدون بريد ظاهر'}
              </p>
              <p className="text-[10px] text-stone-400">
                يشاهد: {surfaceLabel(p.surface)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-ab-border pt-2">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-ab-ink">
          <Pencil className="h-3 w-3 text-ab-accent" aria-hidden />
          آخر التعديلات
        </p>
        {edits.length === 0 ? (
          <p className="text-[10px] text-stone-400">لا تعديلات مسجّلة بعد.</p>
        ) : (
          <ul className="space-y-1.5">
            {edits.slice(0, 5).map((e) => (
              <li key={e.id} className="text-[10px] leading-snug text-stone-600">
                <span className="font-semibold text-ab-ink">{e.actorAr}</span>
                {' · '}
                {e.actionAr}
                {e.detailAr ? ` — ${e.detailAr.slice(0, 60)}` : ''}
                <span className="text-stone-400"> · {relativeAr(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAgent && (
        <p className="mt-2 text-[10px] text-violet-700">AI نشط: {agentDisplay}</p>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="relative" dir="rtl">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center -space-x-1.5 space-x-reverse" aria-hidden>
            {viewing.slice(0, 4).map((p, i) => (
              <span
                key={p.key}
                title={`${peerLabel(p)}${p.email ? ` · ${p.email}` : ''}`}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-emerald-700 text-[8px] font-bold text-white"
                style={{ zIndex: 10 - i }}
              >
                {initials(peerLabel(p))}
              </span>
            ))}
            {showAgent && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-violet-600 text-[8px] font-bold text-white">
                AI
              </span>
            )}
          </div>
          {summary}
          {lastEdit && (
            <span className="truncate text-[10px] text-stone-400">
              · آخر تعديل: {lastEdit.actorAr} {relativeAr(lastEdit.at)}
            </span>
          )}
        </div>
        {panel}
      </div>
    )
  }

  return (
    <div className="relative" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
        <div className="flex items-center -space-x-2 space-x-reverse" aria-hidden>
          {online.slice(0, 5).map((p, i) => (
            <span
              key={p.key}
              title={peerDetail(p) || peerLabel(p)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white',
                p.status === 'away'
                  ? 'bg-stone-400'
                  : p.typing
                    ? 'bg-ab-accent'
                    : 'bg-emerald-700'
              )}
              style={{ zIndex: 10 - i }}
            >
              {initials(peerLabel(p))}
            </span>
          ))}
          {showAgent && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-[9px] font-bold text-white">
              AI
            </span>
          )}
        </div>
        {summary}
        {lastEdit && (
          <span className="text-stone-400">
            · {lastEdit.actorAr} {lastEdit.actionAr} · {relativeAr(lastEdit.at)}
          </span>
        )}
      </div>
      {panel}
    </div>
  )
}

/** Broadcast a room edit so everyone sees «آخر التعديلات». */
export async function broadcastRoomEdit(
  scopeId: string,
  edit: Omit<RoomEditEvent, 'id'> & { id?: string }
) {
  if (!isSupabaseConfigured()) return
  try {
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`room-edits:${scopeId}`)
    await new Promise<void>((resolve) => {
      void ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
      })
      window.setTimeout(() => resolve(), 1200)
    })
    await ch.send({
      type: 'broadcast',
      event: 'room-edit',
      payload: {
        id: edit.id || `edit-${Date.now()}`,
        actorAr: edit.actorAr,
        actionAr: edit.actionAr,
        detailAr: edit.detailAr,
        at: edit.at || Date.now(),
      },
    })
    void sb.removeChannel(ch)
  } catch {
    /* ignore */
  }
}
