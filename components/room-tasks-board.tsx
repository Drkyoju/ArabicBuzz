'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckSquare,
  ListOrdered,
  MessageSquare,
  Plus,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useSignedIn } from '@/lib/supabase/use-signed-in'

type Task = {
  id: string
  titleAr: string
  notesAr: string | null
  status: string
  priority: number
  dueAt: string | null
  assigneeAr: string | null
  assigneeEmail: string | null
  assigneeUserId: string | null
  sortOrder: number
  source: string
}

type Member = {
  id: string
  userId: string | null
  email: string | null
  displayNameAr: string
}

type Comment = {
  id: string
  authorAr: string
  bodyAr: string
  createdAt: string
}

function fmtDue(iso: string | null) {
  if (!iso) return 'بدون موعد'
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Shared tasks/orders whiteboard for the room + AI reconcile. */
export function RoomTasksBoard() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [me, setMe] = useState<{
    nameAr: string
    email: string | null
    userId: string | null
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const [tasksRes, membersRes] = await Promise.all([
        fetch(`/api/rooms/tasks?scopeId=${encodeURIComponent(scopeId)}`, {
          headers: await authHeaders(),
        }),
        fetch(`/api/rooms/members?scopeId=${encodeURIComponent(scopeId)}`, {
          headers: await authHeaders(),
        }),
      ])
      const tasksData = (await tasksRes.json()) as { tasks?: Task[] }
      const membersData = (await membersRes.json()) as { members?: Member[] }
      setTasks(tasksData.tasks || [])
      setMembers(membersData.members || [])
    } catch {
      /* ignore */
    }
  }, [scopeId])

  useEffect(() => {
    void load()
    try {
      localStorage.setItem('ab-room-collab-seen', '1')
      window.dispatchEvent(new Event('ab-room-collab-seen'))
    } catch {
      /* ignore */
    }
  }, [load])

  useEffect(() => {
    if (signedIn !== true) {
      setMe(null)
      return
    }
    void (async () => {
      try {
        const { createBrowserSupabaseClient } = await import(
          '@/lib/supabase/browser'
        )
        const sb = createBrowserSupabaseClient()
        const { data } = await sb.auth.getUser()
        const u = data.user
        if (!u) return
        setMe({
          userId: u.id,
          email: u.email || null,
          nameAr:
            (u.user_metadata?.full_name as string) ||
            u.email?.split('@')[0] ||
            'أنا',
        })
      } catch {
        /* ignore */
      }
    })()
  }, [signedIn])

  function memberByKey(key: string): Member | null {
    if (!key) return null
    return (
      members.find(
        (m) =>
          m.id === key ||
          m.userId === key ||
          (m.email && m.email === key) ||
          m.displayNameAr === key
      ) || null
    )
  }

  async function add() {
    if (!title.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const member = memberByKey(newAssignee)
      const res = await fetch('/api/rooms/tasks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          titleAr: title.trim(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          assigneeAr: member?.displayNameAr || undefined,
          assigneeEmail: member?.email || undefined,
          assigneeUserId: member?.userId || undefined,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تمت الإضافة')
      setTitle('')
      setNewAssignee('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function reconcile() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/rooms/tasks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'reconcile', scopeId }),
      })
      const data = (await res.json()) as { messageAr?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تم الضبط')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch('/api/rooms/tasks', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action: 'update',
        scopeId,
        taskId: id,
        patch: { status },
      }),
    })
    await load()
  }

  async function assignTask(
    taskId: string,
    member: Member | null,
    self?: boolean
  ) {
    const patch = self && me
      ? {
          assigneeAr: me.nameAr,
          assigneeEmail: me.email,
          assigneeUserId: me.userId,
        }
      : member
        ? {
            assigneeAr: member.displayNameAr,
            assigneeEmail: member.email,
            assigneeUserId: member.userId,
          }
        : {
            assigneeAr: null,
            assigneeEmail: null,
            assigneeUserId: null,
          }
    setBusy(true)
    try {
      const res = await fetch('/api/rooms/tasks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'update',
          scopeId,
          taskId,
          patch,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل التعيين')
      setMsg(data.messageAr || 'تم التعيين')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التعيين')
    } finally {
      setBusy(false)
    }
  }

  async function loadComments(taskId: string) {
    try {
      const res = await fetch(
        `/api/rooms/tasks/comments?scopeId=${encodeURIComponent(scopeId)}&taskId=${encodeURIComponent(taskId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { comments?: Comment[] }
      setComments((prev) => ({ ...prev, [taskId]: data.comments || [] }))
    } catch {
      /* ignore */
    }
  }

  async function toggleComments(taskId: string) {
    if (openComments === taskId) {
      setOpenComments(null)
      return
    }
    setOpenComments(taskId)
    setCommentDraft('')
    await loadComments(taskId)
  }

  async function addComment(taskId: string) {
    if (!commentDraft.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/rooms/tasks/comments', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          taskId,
          bodyAr: commentDraft.trim(),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setCommentDraft('')
      await loadComments(taskId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التعليق')
    } finally {
      setBusy(false)
    }
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  return (
    <section className="space-y-3" dir="rtl">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-ab-ink">
          <CheckSquare className="h-5 w-5 text-ab-accent" />
          لوحة المهام والطلبات
        </h2>
        <p className="text-xs text-stone-500">
          مشتركة للغرفة كلها — عيّن مسؤولاً، علّق باختصار، والوكيل يرتّب الأولوية.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-ab-border bg-ab-surface p-3">
        <input
          className="min-w-[12rem] flex-1 rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
          placeholder="مهمة أو طلب جديد…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded-md border border-ab-border bg-white px-2 py-2 text-xs"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          dir="ltr"
        />
        <select
          className="rounded-md border border-ab-border bg-white px-2 py-2 text-xs"
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          aria-label="المسؤول"
        >
          <option value="">بدون مسؤول</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayNameAr}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !title.trim()}
          title={!title.trim() ? 'اكتب عنوان المهمة أولاً' : undefined}
          aria-disabled={busy || !title.trim()}
          onClick={() => void add()}
          className="inline-flex items-center gap-1 rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> أضف
        </button>
        <button
          type="button"
          disabled={busy || open.length === 0}
          title={
            open.length === 0
              ? 'لا مهام مفتوحة لترتيبها — أضف مهمة أولاً'
              : undefined
          }
          aria-disabled={busy || open.length === 0}
          onClick={() => void reconcile()}
          className="inline-flex items-center gap-1 rounded-md bg-stone-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Sparkles className="h-3.5 w-3.5" />
          رتّب وعدّل المواعيد
        </button>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}

      <ul className="divide-y divide-ab-border rounded-xl border border-ab-border bg-white">
        {open.length === 0 ? (
          <li className="p-6 text-center text-sm text-stone-400">
            لا مهام — أضف يدوياً أو اطلب من الوكيل: «أضف طلباً… إلى لوحة الغرفة».
          </li>
        ) : (
          open.map((t, i) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ab-ink">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-500">
                      {i + 1}
                    </span>
                    {t.titleAr}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    <ListOrdered className="me-1 inline h-3 w-3" />
                    أولوية {t.priority} · {fmtDue(t.dueAt)}
                    {t.assigneeAr ? (
                      <span className="ms-1 inline-flex items-center gap-0.5 text-ab-ink/80">
                        <UserRound className="h-3 w-3" />
                        {t.assigneeAr}
                      </span>
                    ) : (
                      ' · بلا مسؤول'
                    )}
                    {t.source === 'ai' ? ' · وكيل' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    className="max-w-[9rem] rounded-md border border-ab-border bg-white px-1.5 py-1 text-[11px]"
                    value={
                      members.find(
                        (m) =>
                          (m.userId && m.userId === t.assigneeUserId) ||
                          (m.email && m.email === t.assigneeEmail) ||
                          m.displayNameAr === t.assigneeAr
                      )?.id || ''
                    }
                    onChange={(e) => {
                      const m = memberByKey(e.target.value)
                      void assignTask(t.id, m)
                    }}
                    aria-label="تعيين مسؤول"
                  >
                    <option value="">مسؤول…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayNameAr}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!me || busy}
                    onClick={() => void assignTask(t.id, null, true)}
                    className="rounded-md border border-ab-accent/40 bg-ab-accent/10 px-2 py-1 text-[11px] font-semibold text-ab-accent disabled:opacity-40"
                  >
                    لي
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleComments(t.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2 py-1 text-[11px] text-stone-600"
                  >
                    <MessageSquare className="h-3 w-3" />
                    تعليق
                  </button>
                  <button
                    type="button"
                    onClick={() => void setStatus(t.id, 'done')}
                    className="rounded-md border border-emerald-600/30 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800"
                  >
                    تم
                  </button>
                </div>
              </div>
              {openComments === t.id && (
                <div className="mt-2 rounded-lg border border-ab-border/70 bg-stone-50/80 p-2.5">
                  <ul className="mb-2 max-h-40 space-y-1.5 overflow-y-auto">
                    {(comments[t.id] || []).length === 0 ? (
                      <li className="text-[11px] text-stone-400">
                        لا تعليقات بعد
                      </li>
                    ) : (
                      (comments[t.id] || []).map((c) => (
                        <li key={c.id} className="text-[11px] text-stone-700">
                          <span className="font-semibold text-ab-ink">
                            {c.authorAr}
                          </span>
                          <span className="text-stone-400"> · </span>
                          {c.bodyAr}
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="flex gap-1.5">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                      placeholder="تعليق قصير…"
                      value={commentDraft}
                      maxLength={500}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addComment(t.id)
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy || !commentDraft.trim()}
                      onClick={() => void addComment(t.id)}
                      className="rounded-md bg-ab-accent px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      أرسل
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
