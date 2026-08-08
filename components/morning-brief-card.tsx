'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Inbox,
  ListTodo,
  Radio,
  Send,
  Sun,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { cn } from '@/lib/utils'

type Brief = {
  hasContent: boolean
  messageAr?: string
  orgMail?: {
    unread: number
    recent: Array<{ id: string; subject: string; from: string; whenAr: string }>
  }
  telegram?: Array<{ id: string; textAr: string; senderAr: string; atAr: string }>
  conflicts?: Array<{ titleAr: string; whenAr: string; overlapMinutes: number }>
  overdueTasks?: Array<{ id: string; titleAr: string; assigneeAr?: string | null }>
  todayEvents?: Array<{ id: string; titleAr: string; whenAr: string }>
  pendingApprovals?: number
}

/** Compact owner/staff morning briefing on لوحة اليوم. */
export function MorningBriefCard({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rooms/morning-brief?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      if (!res.ok) return
      setBrief((await res.json()) as Brief)
    } catch {
      /* ignore */
    }
  }, [scopeId])

  useEffect(() => {
    void load()
  }, [load])

  async function sendTelegram() {
    if (!canAccessOpsUi || busy) return
    setBusy(true)
    setSendMsg('')
    try {
      const res = await fetch('/api/rooms/morning-brief', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, sendTelegram: true }),
      })
      const data = (await res.json()) as { messageAr?: string }
      setSendMsg(data.messageAr || (res.ok ? 'تم' : 'فشل'))
    } catch {
      setSendMsg('تعذّر الإرسال')
    } finally {
      setBusy(false)
    }
  }

  if (!brief?.hasContent) return null

  const mail = brief.orgMail
  const conflicts = brief.conflicts || []
  const overdue = brief.overdueTasks || []
  const tg = brief.telegram || []

  return (
    <section className="rounded-xl border border-amber-200/80 bg-gradient-to-l from-amber-50/70 to-ab-surface px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
          <Sun className="h-4 w-4 text-amber-700" aria-hidden />
          إحاطة الصباح
        </h2>
        <div className="flex items-center gap-1.5">
          {canAccessOpsUi ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendTelegram()}
              className="ab-btn-ghost !py-1 text-[11px]"
              title="إرسال لتيليجرام (فقط إن وُجد محتوى)"
            >
              <Send className="h-3 w-3" aria-hidden />
              تيليجرام
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(mail?.unread || 0) > 0 || (mail?.recent?.length || 0) > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('mail')}
            className="rounded-lg border border-ab-border/60 bg-white/70 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-muted">
              <Inbox className="h-3 w-3" aria-hidden />
              بريد الجمعية
              {mail?.unread ? (
                <span className="ab-badge-accent tabular-nums">{mail.unread}</span>
              ) : null}
            </p>
            <ul className="mt-1 space-y-0.5">
              {(mail?.recent || []).slice(0, 3).map((m) => (
                <li key={m.id} className="truncate text-[12px] text-ab-ink">
                  {m.subject}
                </li>
              ))}
            </ul>
          </button>
        ) : null}

        {conflicts.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-lg border border-amber-300/70 bg-amber-50/80 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-900">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              تعارضات اليوم · {conflicts.length}
            </p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.slice(0, 3).map((c, i) => (
                <li key={`${c.titleAr}-${i}`} className="truncate text-[12px] text-amber-950">
                  {c.titleAr} · تداخل {c.overlapMinutes} د
                </li>
              ))}
            </ul>
          </button>
        ) : null}

        {overdue.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('calendar:tasks')}
            className="rounded-lg border border-rose-200/80 bg-rose-50/60 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-900">
              <ListTodo className="h-3 w-3" aria-hidden />
              متأخر · {overdue.length}
            </p>
            <ul className="mt-1 space-y-0.5">
              {overdue.slice(0, 3).map((t) => (
                <li key={t.id} className="truncate text-[12px] text-rose-950">
                  {t.titleAr}
                </li>
              ))}
            </ul>
          </button>
        ) : null}

        {tg.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('chats')}
            className="rounded-lg border border-ab-border/60 bg-white/70 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-muted">
              <Radio className="h-3 w-3" aria-hidden />
              تيليجرام
            </p>
            <ul className="mt-1 space-y-0.5">
              {tg.slice(0, 2).map((t) => (
                <li key={t.id} className="truncate text-[12px] text-ab-ink">
                  <span className="text-ab-muted">{t.senderAr}:</span> {t.textAr}
                </li>
              ))}
            </ul>
          </button>
        ) : null}
      </div>

      {sendMsg ? (
        <p className={cn('mt-2 text-[11px] text-ab-muted')}>{sendMsg}</p>
      ) : null}
    </section>
  )
}
