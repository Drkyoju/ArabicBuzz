'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Inbox,
  ListTodo,
  Radio,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { plainFromMarkdown } from '@/lib/text/plain-from-markdown'
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
  soonReminders?: Array<{
    id: string
    titleAr: string
    whenAr: string
    mins: number
  }>
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

  useEffect(() => {
    const onFocus = () => {
      const el = document.getElementById('ab-morning-brief')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      void load()
    }
    window.addEventListener('ab-morning-brief-focus', onFocus)
    return () => window.removeEventListener('ab-morning-brief-focus', onFocus)
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

  if (!brief) return null

  const mail = brief.orgMail
  const conflicts = brief.conflicts || []
  const overdue = brief.overdueTasks || []
  const tg = brief.telegram || []
  const soon = brief.soonReminders || []
  const today = brief.todayEvents || []
  const pending = brief.pendingApprovals || 0

  if (!brief.hasContent) {
    return (
      <section
        id="ab-morning-brief"
        className="rounded-xl border border-ab-border bg-ab-surface px-3 py-2.5"
        dir="rtl"
      >
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
          <Sun className="h-4 w-4 text-ab-accent" aria-hidden />
          إحاطة الصباح
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ab-muted">
          {brief.messageAr || 'لا جديد الآن — يوم هادئ حتى الآن.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-md border border-ab-border bg-ab-stage px-2 py-1 text-[11px] font-semibold text-ab-ink hover:border-ab-accent/40"
          >
            تقويم الفريق
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('mail')}
            className="rounded-md border border-ab-border bg-ab-stage px-2 py-1 text-[11px] font-semibold text-ab-ink hover:border-ab-accent/40"
          >
            بريد الجمعية
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      id="ab-morning-brief"
      className="rounded-xl border border-ab-border bg-gradient-to-l from-ab-accent/10 to-ab-surface px-3 py-2.5"
      dir="rtl"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
          <Sun className="h-4 w-4 text-ab-accent" aria-hidden />
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
        {soon.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-lg border border-ab-accent/30 bg-ab-accent/5 px-2.5 py-2 text-start sm:col-span-2"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-accent">
              تذكير موعد · خلال ≈ ساعة
            </p>
            <ul className="mt-1 space-y-0.5">
              {soon.slice(0, 3).map((e) => (
                <li key={e.id} className="truncate text-[12px] text-ab-ink">
                  {e.titleAr} · بعد ≈{e.mins} د · {e.whenAr}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-ab-muted">
              تذكير واحد قبل الموعد — بلا تكرار مزعج.
            </p>
          </button>
        ) : null}

        {today.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-lg border border-ab-border/60 bg-ab-stage/70 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-muted">
              <CalendarDays className="h-3 w-3" aria-hidden />
              مواعيد اليوم · {today.length}
            </p>
            <ul className="mt-1 space-y-0.5">
              {today.slice(0, 3).map((e) => (
                <li key={e.id} className="truncate text-[12px] text-ab-ink">
                  {e.titleAr} · {e.whenAr}
                </li>
              ))}
            </ul>
          </button>
        ) : null}

        {(mail?.unread || 0) > 0 || (mail?.recent?.length || 0) > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('mail')}
            className="rounded-lg border border-ab-border/60 bg-ab-stage/70 px-2.5 py-2 text-start"
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
            className="rounded-lg border border-ab-warn/40 bg-ab-warn/10 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-warn">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              تعارضات اليوم · {conflicts.length}
            </p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.slice(0, 3).map((c, i) => (
                <li
                  key={`${c.titleAr}-${i}`}
                  className="truncate text-[12px] text-ab-ink"
                >
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
            className="rounded-lg border border-ab-danger/30 bg-ab-danger/10 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-danger">
              <ListTodo className="h-3 w-3" aria-hidden />
              متأخر · {overdue.length}
            </p>
            <ul className="mt-1 space-y-0.5">
              {overdue.slice(0, 3).map((t) => (
                <li key={t.id} className="truncate text-[12px] text-ab-ink">
                  {t.titleAr}
                </li>
              ))}
            </ul>
          </button>
        ) : null}

        {pending > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('approvals')}
            className="rounded-lg border border-ab-warn/40 bg-ab-warn/10 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-warn">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              موافقات معلّقة · {pending}
            </p>
            <p className="mt-1 text-[12px] text-ab-ink">
              راجع صندوق الموافقات قبل تنفيذ الإجراءات الحساسة.
            </p>
          </button>
        ) : null}

        {tg.length > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate?.('chats')}
            className="rounded-lg border border-ab-border/60 bg-ab-stage/70 px-2.5 py-2 text-start"
          >
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ab-muted">
              <Radio className="h-3 w-3" aria-hidden />
              تيليجرام
            </p>
            <ul className="mt-1 space-y-0.5">
              {tg.slice(0, 2).map((t) => (
                <li key={t.id} className="truncate text-[12px] text-ab-ink">
                  <span className="text-ab-muted">{t.senderAr}:</span>{' '}
                  {plainFromMarkdown(t.textAr)}
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
