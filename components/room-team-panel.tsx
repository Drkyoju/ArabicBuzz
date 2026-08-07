'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Mail, Trash2, UserPlus } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { RoleBadge } from '@/components/role-badge'
import { roomRoleLabelAr } from '@/lib/auth/role-labels'
import { isDirectorEmail, labelArForEmail } from '@/lib/auth/roles'

type Member = {
  id: string
  displayNameAr: string
  email: string | null
  role: string
  phone?: string | null
  committee?: string | null
  notesAr?: string | null
}

type Invite = {
  id: string
  email: string | null
  status: string
  inviteUrl?: string
  createdAt: string
}

type ActivityEvent = {
  id: string
  kind: string
  titleAr: string
  detailAr: string
  actorAr: string
  at: number
}

type NowSnap = {
  lastHumanMessage: {
    authorAr: string
    content: string
    at: number
  } | null
  lastCanvasEdit: {
    titleAr: string
    updatedBy: string | null
    at: number | null
  } | null
  memberCount: number
}

function fmt(ts: number | null | undefined) {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Riyadh',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString('ar')
  }
}

export function RoomTeamPanel({ scopeId }: { scopeId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [now, setNow] = useState<NowSnap | null>(null)
  const [nameAr, setNameAr] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [committee, setCommittee] = useState('')
  const [notesAr, setNotesAr] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'people' | 'history'>('people')
  const [canManage, setCanManage] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const refresh = useCallback(async () => {
    try {
      setLoadErr('')
      const headers = await authHeaders()
      const [mRes, iRes, aRes] = await Promise.all([
        fetch(`/api/rooms/members?scopeId=${encodeURIComponent(scopeId)}`, {
          headers,
        }),
        fetch(`/api/rooms/invites?scopeId=${encodeURIComponent(scopeId)}`, {
          headers,
        }),
        fetch(`/api/rooms/activity?scopeId=${encodeURIComponent(scopeId)}&limit=200`, {
          headers,
        }),
      ])
      const mData = (await mRes.json()) as {
        members?: Member[]
        canManage?: boolean
        myRole?: string
        error?: string
      }
      const iData = (await iRes.json()) as { invites?: Invite[]; error?: string }
      const aData = (await aRes.json()) as {
        events?: ActivityEvent[]
        now?: NowSnap
        totalEvents?: number
        error?: string
      }
      if (!mRes.ok) {
        setLoadErr(mData.error || `تعذّر تحميل الأعضاء (${mRes.status})`)
      }
      setMembers(mData.members || [])
      setCanManage(mData.canManage !== false)
      setInvites((iData.invites || []).filter((i) => i.status === 'pending'))
      setEvents(aData.events || [])
      setNow(
        aData.now || {
          lastHumanMessage: null,
          lastCanvasEdit: null,
          memberCount: mData.members?.length || 0,
        }
      )
      setTotalEvents(aData.totalEvents || aData.events?.length || 0)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'تعذّر تحديث الغرفة')
    }
  }, [scopeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function addMember() {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/members', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          displayNameAr: nameAr.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          committee: committee.trim() || undefined,
          notesAr: notesAr.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تمت الإضافة')
      setNameAr('')
      setEmail('')
      setPhone('')
      setCommittee('')
      setNotesAr('')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(memberId: string) {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(
        `/api/rooms/members?scopeId=${encodeURIComponent(scopeId)}&memberId=${encodeURIComponent(memberId)}`,
        { method: 'DELETE', headers: await authHeaders() }
      )
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الحذف')
      setMsg(data.messageAr || 'تم الحذف')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function createLink() {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/invites', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, kind: 'link' }),
      })
      const data = (await res.json()) as {
        error?: string
        inviteUrl?: string
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setLinkUrl(data.inviteUrl || '')
      setMsg(data.messageAr || 'الرابط جاهز')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function inviteViaTelegram() {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/invites', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          kind: 'link',
          notifyChannels: ['telegram'],
        }),
      })
      const data = (await res.json()) as {
        error?: string
        inviteUrl?: string
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setLinkUrl(data.inviteUrl || '')
      setMsg(data.messageAr || 'تم')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function inviteByEmail() {
    if (!email.trim().includes('@')) {
      setErr('أدخل بريداً صالحاً')
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/rooms/invites', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          kind: 'email',
          email: email.trim(),
          displayNameAr: nameAr.trim() || undefined,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        inviteUrl?: string
        mailto?: string
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setLinkUrl(data.inviteUrl || '')
      setMsg(data.messageAr || 'سُجّلت الدعوة')
      if (data.mailto) {
        window.location.href = data.mailto
      }
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setMsg('نُسخ الرابط')
    } catch {
      setErr('تعذّر النسخ')
    }
  }

  return (
    <div className="relative z-10 space-y-3 text-xs" dir="rtl">
      <div className="flex gap-1 rounded-md bg-stone-100 p-0.5">
        <button
          type="button"
          onClick={() => setTab('people')}
          className={`flex-1 rounded px-2 py-1.5 font-medium ${
            tab === 'people' ? 'bg-white shadow-sm' : 'text-stone-500'
          }`}
        >
          الأعضاء والدعوات
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex-1 rounded px-2 py-1.5 font-medium ${
            tab === 'history' ? 'bg-white shadow-sm' : 'text-stone-500'
          }`}
        >
          متصل · السجل الكامل
        </button>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700">{err}</p>
      )}
      {loadErr && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-800">
          {loadErr}
        </p>
      )}

      {tab === 'people' ? (
        <>
          {/* Invite first so «رابط دعوة» stays above the chat feed without scrolling */}
          <div className="relative z-20 rounded-md border border-ab-border bg-white p-2 space-y-2 shadow-sm">
            <p className="font-semibold text-ab-ink">دعوة زميل للغرفة</p>
            {canManage && (
              <p className="text-[10px] leading-relaxed text-stone-500">
                أنشئ رابط دعوة → الزميل يسجّل الدخول ثم يفتح الرابط وينضم.
              </p>
            )}
            {!canManage && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                الدعوة وإدارة الأعضاء للمالك فقط.
              </p>
            )}
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="الاسم الظاهر"
              disabled={!canManage}
              className="w-full rounded border border-ab-border px-2 py-1.5 disabled:opacity-50"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد (اختياري)"
              disabled={!canManage}
              className="w-full rounded border border-ab-border px-2 py-1.5 disabled:opacity-50"
              dir="ltr"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="الجوال (اختياري)"
              disabled={!canManage}
              className="w-full rounded border border-ab-border px-2 py-1.5 disabled:opacity-50"
              dir="ltr"
            />
            <select
              value={committee}
              onChange={(e) => setCommittee(e.target.value)}
              disabled={!canManage}
              className="w-full rounded border border-ab-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              <option value="">بدون لجنة</option>
              <option value="finance">اللجنة المالية</option>
              <option value="programs">لجنة البرامج</option>
              <option value="board">مجلس الإدارة</option>
            </select>
            <input
              value={notesAr}
              onChange={(e) => setNotesAr(e.target.value)}
              placeholder="ملاحظة قصيرة"
              disabled={!canManage}
              className="w-full rounded border border-ab-border px-2 py-1.5 disabled:opacity-50"
            />
            <div className="relative z-10 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy || !canManage || !nameAr.trim()}
                title={
                  !canManage
                    ? 'للمالك فقط'
                    : !nameAr.trim()
                      ? 'أدخل الاسم الظاهر أولاً'
                      : 'إضافة عضو للاسم الظاهر'
                }
                onClick={() => void addMember()}
                className="relative z-10 inline-flex items-center gap-1 rounded-md bg-ab-ink px-2.5 py-1.5 text-white disabled:opacity-40"
              >
                <UserPlus className="h-3 w-3" />
                أضف للسجل
              </button>
              <button
                type="button"
                disabled={busy || !canManage || !email.trim()}
                title={
                  !canManage
                    ? 'للمالك فقط'
                    : !email.trim()
                      ? 'أدخل البريد أولاً لإنشاء دعوة بريدية'
                      : 'يرسل دعوة بالبريد مع رابط انضمام'
                }
                onClick={() => void inviteByEmail()}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 disabled:opacity-40"
              >
                <Mail className="h-3 w-3" />
                دعوة بريد + رابط
              </button>
              <button
                type="button"
                disabled={busy || !canManage}
                title={!canManage ? 'للمالك فقط' : 'ينشئ رابط انضمام يمكن نسخه'}
                onClick={() => void createLink()}
                className="relative z-10 inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 disabled:opacity-40"
              >
                <Link2 className="h-3 w-3" />
                رابط دعوة
              </button>
              <button
                type="button"
                disabled={busy || !canManage}
                onClick={() => void inviteViaTelegram()}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 disabled:opacity-40"
                title={
                  !canManage
                    ? 'للمالك فقط'
                    : 'ينشئ رابط دعوة ويرسله إلى تيليجرام المالك'
                }
              >
                تيليجرام · رابط دعوة
              </button>
            </div>
            {canManage && (!nameAr.trim() || !email.trim()) && (
              <p className="text-[10px] text-amber-800">
                {!nameAr.trim()
                  ? 'لإضافة عضو يدوياً: اكتب الاسم الظاهر ثم «أضف للغرفة».'
                  : null}
                {nameAr.trim() && !email.trim()
                  ? ' لدعوة بالبريد: أدخل البريد ثم «دعوة بريد + رابط». أو استخدم «رابط دعوة» بدون بريد.'
                  : null}
              </p>
            )}
            <p className="text-[10px] leading-relaxed text-stone-500">
              «رابط دعوة» هو الأوثق — انسخه وشاركه. إرسال البريد التلقائي يحتاج
              ضبط <span dir="ltr">RESEND_API_KEY</span>؛ بدونها يبقى النسخ
              وmailto يعملان. تيليجرام يرسل الرابط للقناة المضبوطة إن وُجدت.
            </p>
            {linkUrl && (
              <div className="relative z-40 isolate space-y-1.5">
                <div className="relative z-40 flex items-center gap-1 rounded bg-stone-50 p-1.5" dir="ltr">
                  <code className="min-w-0 flex-1 truncate text-[10px]">
                    {linkUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyLink(linkUrl)}
                    className="relative z-40 inline-flex shrink-0 items-center gap-1 rounded border border-ab-border bg-white px-2 py-1 text-[10px] font-medium text-ab-ink pointer-events-auto"
                    aria-label="نسخ الرابط"
                  >
                    <Copy className="h-3 w-3" />
                    نسخ الرابط
                  </button>
                </div>
                <p className="text-[10px] text-emerald-800">
                  انسخ الرابط وأرسله للزميل — بعد تسجيل دخوله يفتح الرابط وينضم.
                </p>
              </div>
            )}
          </div>

          {invites.length > 0 && (
            <div className="relative z-40 isolate">
              <p className="mb-1 font-semibold">دعوات معلّقة</p>
              <ul className="space-y-1">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="relative z-40 flex items-center justify-between gap-2 rounded border border-dashed border-ab-border bg-stone-50 px-2 py-1"
                  >
                    <span className="truncate" dir="ltr">
                      {i.email || 'رابط'}
                    </span>
                    {i.inviteUrl && (
                      <button
                        type="button"
                        onClick={() => void copyLink(i.inviteUrl!)}
                        className="relative z-40 shrink-0 rounded border border-ab-border bg-white px-2 py-1 text-[10px] font-medium text-ab-accent pointer-events-auto"
                      >
                        نسخ
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1.5 font-semibold text-ab-ink">
              الأعضاء ({members.length})
            </p>
            <ul className="space-y-1">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-ab-border bg-white px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{m.displayNameAr}</p>
                      <RoleBadge
                        labelAr={
                          isDirectorEmail(m.email)
                            ? labelArForEmail(m.email)
                            : roomRoleLabelAr(m.role)
                        }
                      />
                    </div>
                    <p className="truncate text-[10px] text-ab-muted-soft" dir="ltr">
                      {[m.email, m.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {(m.committee || m.notesAr) && (
                      <p className="truncate text-[10px] text-stone-500">
                        {m.committee === 'finance'
                          ? 'مالية'
                          : m.committee === 'programs'
                            ? 'برامج'
                            : m.committee === 'board'
                              ? 'مجلس'
                              : m.committee || ''}
                        {m.notesAr ? ` · ${m.notesAr}` : ''}
                      </p>
                    )}
                    {m.role !== 'owner' && canManage && (
                      <p className="mt-1 text-[10px] text-stone-500">
                        متطوع — ترقية المجلس محصورة على البريد المعتمد.
                      </p>
                    )}
                  </div>
                  {m.role !== 'owner' && canManage ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `إزالة العضو «${m.displayNameAr}» من الغرفة؟`
                          )
                        ) {
                          void removeMember(m.id)
                        }
                      }}
                      className="rounded p-1 text-ab-muted-soft hover:text-red-600"
                      aria-label={`حذف ${m.displayNameAr}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-ab-border bg-white p-2 space-y-1.5">
            <p className="font-semibold text-ab-ink">الآن</p>
            <p className="text-stone-600">
              الأعضاء:{' '}
              <strong>
                {now?.memberCount ?? members.length}
              </strong>
              {members.length > 0 && now?.memberCount == null
                ? ` (محلي ${members.length})`
                : ''}
            </p>
            <p className="text-stone-600">
              آخر رسالة بشرية:{' '}
              {now?.lastHumanMessage
                ? `${now.lastHumanMessage.authorAr} — ${fmt(now.lastHumanMessage.at)}`
                : 'لا يوجد'}
            </p>
            {now?.lastHumanMessage && (
              <p className="line-clamp-2 text-stone-500">
                «{now.lastHumanMessage.content}»
              </p>
            )}
            <p className="text-stone-600">
              آخر تعديل لوحة:{' '}
              {now?.lastCanvasEdit
                ? `${now.lastCanvasEdit.titleAr} · ${now.lastCanvasEdit.updatedBy || 'غير معروف'} · ${fmt(now.lastCanvasEdit.at)}`
                : 'لا يوجد'}
            </p>
          </div>
          <div>
            <p className="mb-1.5 font-semibold">
              السجل الكامل ({totalEvents || events.length})
            </p>
            <p className="mb-2 text-[10px] text-stone-500">
              كل الرسائل البشرية والوكلاء وأحداث النظام وتعديلات اللوحة — الأحدث
              أولاً. الخط الزمني في الدردشة تحت هو نفس المصدر.
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {events.length === 0 ? (
                <li className="text-stone-500">لا أحداث بعد</li>
              ) : (
                events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded border border-ab-border bg-white px-2 py-1.5"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{ev.titleAr}</span>
                      <span className="shrink-0 text-[10px] text-ab-muted-soft">
                        {fmt(ev.at)}
                      </span>
                    </div>
                    <p className="text-stone-500">{ev.actorAr}</p>
                    <p className="line-clamp-3 text-stone-600">{ev.detailAr}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
