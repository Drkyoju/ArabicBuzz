'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, FileText, Inbox, Search, X } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'

type Hit = {
  kind: string
  id: string
  titleAr: string
  snippet?: string
  href?: string
}

const KIND_AR: Record<string, string> = {
  mail: 'بريد الجمعية',
  mail_attachment: 'مرفق بريد',
  workspace_file: 'ملف غرفة',
  knowledge: 'معرفة',
  calendar: 'تقويم',
}

/**
 * Privacy-safe Cmd/Ctrl+K search — org mail + room files + calendar only.
 */
export function UnifiedSearchPalette({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20)
    } else {
      setQ('')
      setHits([])
      setMsg('')
    }
  }, [open])

  const search = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) {
        setHits([])
        setMsg('ابحث في بريد الجمعية وملفات الغرفة والتقويم — دون البريد الشخصي.')
        return
      }
      setBusy(true)
      try {
        const res = await fetch(
          `/api/search/unified?q=${encodeURIComponent(trimmed)}&scopeId=${encodeURIComponent(scopeId)}`,
          { headers: await authHeaders() }
        )
        const data = (await res.json()) as {
          hits?: Hit[]
          messageAr?: string
        }
        setHits(data.hits || [])
        setMsg(data.messageAr || '')
      } catch {
        setMsg('تعذّر البحث')
      } finally {
        setBusy(false)
      }
    },
    [scopeId]
  )

  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void search(q), 280)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, open, search])

  function openHit(h: Hit) {
    setOpen(false)
    if (h.kind === 'calendar') {
      onNavigate?.('calendar')
      return
    }
    if (h.kind === 'mail' || h.kind === 'mail_attachment') {
      onNavigate?.('mail')
      if (h.href) {
        try {
          const u = new URL(h.href, window.location.origin)
          const msgId = u.searchParams.get('msg')
          if (msgId) {
            window.dispatchEvent(
              new CustomEvent('ab-open-mail', { detail: { msgId } })
            )
          }
        } catch {
          /* ignore */
        }
      }
      return
    }
    onNavigate?.('files')
  }

  const iconFor = (kind: string) => {
    if (kind === 'calendar') return CalendarDays
    if (kind.startsWith('mail')) return Inbox
    return FileText
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ab-btn-ghost hidden items-center gap-1.5 text-[11px] md:inline-flex"
        title="بحث موحّد (⌘K)"
        aria-label="بحث موحّد"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        بحث
        <kbd dir="ltr" className="rounded border border-ab-border px-1 text-[10px] text-ab-muted">
          ⌘K
        </kbd>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/35 p-3 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="بحث موحّد"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ab-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-ab-muted" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في بريد الجمعية · الملفات · التقويم…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ab-muted-soft"
            dir="rtl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-ab-muted hover:bg-ab-stage"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="border-b border-ab-border/60 px-3 py-1.5 text-[10px] text-ab-muted">
          لا يشمل بريد الأعضاء الشخصي (Gmail الخاص)
          {busy ? ' · جاري البحث…' : ''}
        </p>
        <ul className="max-h-[50vh] overflow-y-auto">
          {hits.map((h) => {
            const Icon = iconFor(h.kind)
            return (
              <li key={`${h.kind}:${h.id}`}>
                <button
                  type="button"
                  onClick={() => openHit(h)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-start hover:bg-ab-stage"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ab-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ab-ink">
                      {h.titleAr}
                    </span>
                    <span className="block truncate text-[10px] text-ab-muted">
                      {KIND_AR[h.kind] || h.kind}
                      {h.snippet ? ` · ${h.snippet}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {!busy && q.trim() && hits.length === 0 ? (
            <li className="px-3 py-4 text-center text-[12px] text-ab-muted">
              {msg || 'لا نتائج'}
            </li>
          ) : null}
          {!q.trim() ? (
            <li className={cn('px-3 py-4 text-center text-[12px] text-ab-muted')}>
              {msg || 'اكتب كلمة للبحث…'}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
