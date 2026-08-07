'use client'

import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type AuditRow = {
  id: string
  timestamp: string
  riskTier: string
  dataLocality: string
  watermarkSignature: string
  scopeId?: string
  modelUsed?: string
  approvedBy?: string | null
  source?: 'sdaia' | 'room'
  titleAr?: string
  actorAr?: string
  detailAr?: string
}

type RoomActivityEvent = {
  id: string
  kind: string
  titleAr: string
  detailAr: string
  actorAr: string
  at: number
}

const RISK_LABEL: Record<string, string> = {
  TIER_1_LOW: 'منخفض',
  TIER_2_MEDIUM: 'متوسط',
  TIER_3_HIGH: 'مرتفع',
  TIER_4_CRITICAL: 'حرج',
  ROOM: 'نشاط غرفة',
}

function riskBadgeClass(tier: string) {
  if (tier === 'ROOM') return 'bg-sky-50 text-sky-900'
  if (tier.includes('CRITICAL') || tier.includes('4'))
    return 'bg-red-100 text-red-800'
  if (tier.includes('HIGH') || tier.includes('3'))
    return 'bg-amber-100 text-amber-900'
  if (tier.includes('MEDIUM') || tier.includes('2'))
    return 'bg-yellow-50 text-yellow-900'
  return 'bg-emerald-50 text-emerald-800'
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
    const time = new Intl.DateTimeFormat('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
    return { hijri, time, full: iso }
  } catch {
    return { hijri: iso, time: '', full: iso }
  }
}

/**
 * Audit timeline: SDAIA watermarks + live room activity (same events the room shows).
 */
export function SdaiaAuditViewer() {
  const signedIn = useSignedIn()
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [scopeId, setScopeId] = useState('')
  const [risk, setRisk] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!scopeId.trim() && activeScopeId) {
      setScopeId(activeScopeId)
    }
  }, [activeScopeId, scopeId])

  async function load(overrideScope?: string) {
    setErr('')
    setBusy(true)
    const effectiveScope = (overrideScope ?? scopeId).trim() || activeScopeId
    try {
      const qs = new URLSearchParams()
      if (effectiveScope) qs.set('scopeId', effectiveScope)
      if (from) qs.set('from', new Date(from).toISOString())
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        qs.set('to', end.toISOString())
      }

      const headers = await authHeaders()
      const [auditRes, roomRes] = await Promise.all([
        fetch(`/api/audit/export?${qs.toString()}`, { headers }),
        effectiveScope
          ? fetch(
              `/api/rooms/activity?scopeId=${encodeURIComponent(effectiveScope)}&limit=200`,
              { headers }
            )
          : Promise.resolve(null),
      ])

      const merged: AuditRow[] = []

      if (auditRes.ok) {
        const data = await auditRes.json()
        for (const l of data.logs || []) {
          merged.push({ ...l, source: 'sdaia' as const })
        }
      } else if (signedIn === false) {
        setLogs([])
        setErr('سجّل الدخول لعرض سجل التدقيق الحقيقي.')
        return
      }

      if (roomRes?.ok) {
        const roomData = (await roomRes.json()) as {
          events?: RoomActivityEvent[]
          scopeId?: string
        }
        const fromMs = from ? new Date(from).getTime() : 0
        const toMs = to
          ? (() => {
              const end = new Date(to)
              end.setHours(23, 59, 59, 999)
              return end.getTime()
            })()
          : Number.POSITIVE_INFINITY

        for (const ev of roomData.events || []) {
          if (ev.at < fromMs || ev.at > toMs) continue
          merged.push({
            id: `room-${ev.id}`,
            timestamp: new Date(ev.at).toISOString(),
            riskTier: 'ROOM',
            dataLocality: 'غرفة الفريق',
            watermarkSignature: '',
            scopeId: roomData.scopeId || effectiveScope,
            source: 'room',
            titleAr: ev.titleAr,
            actorAr: ev.actorAr,
            detailAr: ev.detailAr,
          })
        }
      } else if (roomRes && !roomRes.ok) {
        // Room feed failed — still show SDAIA if any; surface the gap.
        if (!auditRes.ok) {
          setLogs([])
          setErr(
            'تعذّر تحميل السجل — تحقق من الصلاحيات أو أعد المحاولة.'
          )
          return
        }
        setErr('تعذّر تحميل نشاط الغرفة؛ يُعرض سجل SDAIA فقط.')
      } else if (!auditRes.ok) {
        setLogs([])
        setErr(
          'تعذّر تحميل السجل — تحقق من الصلاحيات أو أعد المحاولة.'
        )
        return
      }

      merged.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      setLogs(merged)
      if (!scopeId.trim() && effectiveScope) setScopeId(effectiveScope)
    } finally {
      setBusy(false)
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (signedIn === null) return
    void load(activeScopeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, activeScopeId])

  const filtered = useMemo(
    () => logs.filter((l) => !risk || l.riskTier === risk),
    [logs, risk]
  )

  function exportCsv() {
    const qs = new URLSearchParams({ format: 'csv' })
    if (scopeId.trim()) qs.set('scopeId', scopeId.trim())
    if (from) qs.set('from', new Date(from).toISOString())
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      qs.set('to', end.toISOString())
    }
    void authHeaders().then((h) =>
      fetch(`/api/audit/export?${qs.toString()}`, { headers: h }).then(
        async (res) => {
          if (!res.ok) {
            setErr('تعذّر التصدير — سجّل الدخول أولاً.')
            return
          }
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'audit-export.csv'
          a.click()
          URL.revokeObjectURL(url)
        }
      )
    )
  }

  if (signedIn === false) {
    return (
      <section className="border-t border-ab-border px-4 py-8" dir="rtl">
        <h2 className="text-xl font-bold">سجل التدقيق</h2>
        <div className="mt-4 rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            يلزم تسجيل الدخول لعرض سجل التدقيق
          </p>
          <p className="mt-1 text-xs text-stone-500">
            يظهر هنا نشاط الغرفة وختم الإجراءات الحساسة بعد تنفيذ الوكلاء —
            للجلسة الحقيقية فقط، وليس معاينة الزائر.
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('ab-nav', { detail: 'settings' })
              )
            }
            className="mt-4 rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
          >
            سجّل الدخول
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="border-t border-ab-border px-4 py-8" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">سجل التدقيق</h2>
          <p className="mt-0.5 text-[11px] text-stone-500">
            نشاط الغرفة (رسائل · لوحة · أعضاء) مع ختم SDAIA للإجراءات الحساسة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-md bg-ab-ink px-3 py-2 text-sm text-white"
        >
          تصدير CSV (SDAIA)
        </button>
      </div>
      {err && <p className="mb-3 text-xs text-amber-800">{err}</p>}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          النطاق
          <input
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            placeholder={activeScopeId || 'shared-demo'}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          الخطر
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
          >
            <option value="">كل التصنيفات</option>
            <option value="ROOM">نشاط غرفة</option>
            <option value="TIER_1_LOW">منخفض (١)</option>
            <option value="TIER_2_MEDIUM">متوسط (٢)</option>
            <option value="TIER_3_HIGH">مرتفع (٣)</option>
            <option value="TIER_4_CRITICAL">حرج (٤)</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded-md border border-ab-border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'جاري التحديث…' : 'تحديث'}
        </button>
      </div>

      {filtered.length === 0 && loaded && !err ? (
        <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-stone-600">لا سجلات بعد</p>
          <p className="mt-1 text-xs text-stone-500">
            ستظهر هنا رسائل الغرفة وتعديلات اللوحة فور حدوثها، مع ختم التدقيق
            للإجراءات الحساسة. تأكد من نطاق الغرفة الحالية.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-0 border-s-2 border-ab-border ps-4">
          {filtered.map((l) => {
            const when = formatWhen(l.timestamp)
            return (
              <li key={l.id} className="relative pb-5 last:pb-0">
                <span
                  className="absolute -start-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ab-accent"
                  aria-hidden
                />
                <div className="rounded-lg border border-ab-border bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ab-ink">
                        {l.titleAr || when.hijri}
                        {when.time ? (
                          <span className="ms-2 text-[11px] font-normal text-stone-500">
                            {when.time}
                          </span>
                        ) : null}
                      </p>
                      {l.titleAr ? (
                        <p className="text-[10px] text-ab-muted-soft">
                          {when.hijri}
                          {when.time ? ` · ${when.time}` : ''}
                        </p>
                      ) : (
                        <p className="text-[10px] text-ab-muted-soft" dir="ltr">
                          {when.full}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${riskBadgeClass(l.riskTier)}`}
                    >
                      {RISK_LABEL[l.riskTier] || l.riskTier}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-[11px] text-stone-600 sm:grid-cols-2">
                    {l.actorAr ? (
                      <div>
                        <dt className="inline text-ab-muted-soft">الفاعل · </dt>
                        <dd className="inline">{l.actorAr}</dd>
                      </div>
                    ) : null}
                    {l.detailAr ? (
                      <div className="sm:col-span-2">
                        <dt className="inline text-ab-muted-soft">التفاصيل · </dt>
                        <dd className="inline">{l.detailAr}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="inline text-ab-muted-soft">النطاق · </dt>
                      <dd className="inline font-mono" dir="ltr">
                        {l.scopeId || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-ab-muted-soft">المحلية · </dt>
                      <dd className="inline">{l.dataLocality || '—'}</dd>
                    </div>
                    {l.modelUsed ? (
                      <div>
                        <dt className="inline text-ab-muted-soft">النموذج · </dt>
                        <dd className="inline font-mono" dir="ltr">
                          {l.modelUsed}
                        </dd>
                      </div>
                    ) : null}
                    {l.approvedBy ? (
                      <div>
                        <dt className="inline text-ab-muted-soft">المعتمد · </dt>
                        <dd className="inline font-mono" dir="ltr">
                          {l.approvedBy}
                        </dd>
                      </div>
                    ) : null}
                    {l.source === 'sdaia' && l.watermarkSignature ? (
                      <div className="sm:col-span-2">
                        <dt className="inline text-ab-muted-soft">الختم · </dt>
                        <dd className="inline font-mono text-[10px]" dir="ltr">
                          {l.watermarkSignature.slice(0, 32)}…
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
