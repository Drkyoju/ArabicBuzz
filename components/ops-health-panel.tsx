'use client'

import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type Snapshot = {
  googleConnected?: boolean
  driveReady?: boolean
  zoomConfigured?: boolean
  telegramConfigured?: boolean
  macOnline?: boolean
  macConfigured?: boolean
  modelsReady?: number
  pendingApprovals?: number
  searchReady?: boolean
  crawlReady?: boolean
  toolsReady?: boolean
}

/**
 * High-level connection status for directors/admins — متصل / غير متصل only.
 * No env-var names or vendor jargon.
 */
export function OpsHealthPanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      const h = await authHeaders()
      const [cal, drive, integ, mac, providers, approvals] = await Promise.all([
        fetch('/api/google/calendar?action=status', { headers: h }).then((r) =>
          r.json()
        ),
        fetch('/api/google/drive/brain', { headers: h }).then((r) => r.json()),
        fetch('/api/integrations/status').then((r) => r.json()),
        fetch('/api/mac/status', { headers: h }).then((r) => r.json()),
        fetch('/api/settings/providers').then((r) => r.json()),
        fetch('/api/agent/approvals', { headers: h }).then((r) => r.json()),
      ])
      setSnap({
        googleConnected: Boolean(cal?.connected),
        driveReady: Number(drive?.count || 0) > 0,
        zoomConfigured: Boolean(integ?.zoomConfigured),
        telegramConfigured: Boolean(integ?.telegramConfigured),
        macOnline: Boolean(mac?.online),
        macConfigured: Boolean(mac?.configured || integ?.macSyncConfigured),
        modelsReady: Number(providers?.serviceableCount || 0),
        pendingApprovals: Array.isArray(approvals?.approvals)
          ? approvals.approvals.filter(
              (a: { status?: string }) => a.status === 'PENDING_APPROVAL'
            ).length
          : 0,
        searchReady: Boolean(integ?.braveConfigured),
        crawlReady: Boolean(integ?.firecrawlConfigured),
        toolsReady: Number(integ?.mcpConnectedServers || 0) > 0,
      })
    } catch (e) {
      setSnap(null)
      setError(e instanceof Error ? e.message : 'تعذّر تحميل حالة الربط')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const rows: Array<{ label: string; ok: boolean; detail: string }> = snap
    ? [
        {
          label: 'نماذج المحادثة',
          ok: (snap.modelsReady || 0) > 0,
          detail: (snap.modelsReady || 0) > 0 ? 'متصل' : 'غير متصل',
        },
        {
          label: 'البحث على الويب',
          ok: Boolean(snap.searchReady),
          detail: snap.searchReady ? 'متصل' : 'غير متصل',
        },
        {
          label: 'جلب صفحات الويب',
          ok: Boolean(snap.crawlReady),
          detail: snap.crawlReady ? 'متصل' : 'غير متصل',
        },
        {
          label: 'أدوات إضافية',
          ok: Boolean(snap.toolsReady),
          detail: snap.toolsReady ? 'متصل' : 'غير متصل',
        },
        {
          label: 'خزنة الجهاز',
          ok: Boolean(snap.macOnline),
          detail: snap.macOnline
            ? 'متصل'
            : snap.macConfigured
              ? 'غير متصل'
              : 'غير متصل',
        },
        {
          label: 'تقويم Google',
          ok: Boolean(snap.googleConnected),
          detail: snap.googleConnected ? 'متصل' : 'غير متصل',
        },
        {
          label: 'ملفات Drive',
          ok: Boolean(snap.driveReady),
          detail: snap.driveReady ? 'متصل' : 'غير متصل',
        },
        {
          label: 'تيليجرام',
          ok: Boolean(snap.telegramConfigured),
          detail: snap.telegramConfigured ? 'متصل' : 'غير متصل',
        },
        {
          label: 'اجتماعات Zoom',
          ok: Boolean(snap.zoomConfigured),
          detail: snap.zoomConfigured ? 'متصل' : 'غير متصل',
        },
        {
          label: 'موافقات معلّقة',
          ok: (snap.pendingApprovals || 0) === 0,
          detail: String(snap.pendingApprovals || 0),
        },
      ]
    : []

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Activity className="h-5 w-5 text-ab-accent" aria-hidden />
            حالة الربط
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            نظرة سريعة: متصل أو غير متصل — بدون تفاصيل تقنية.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-ab-warn">{error}</p>}
      {!snap && !error && (
        <p className="text-sm text-stone-500">جاري التحميل…</p>
      )}
      {snap && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-ab-border bg-ab-surface px-3 py-2 text-sm"
            >
              <span className="font-medium text-ab-ink">{r.label}</span>
              <span
                className={
                  r.ok
                    ? 'text-[11px] text-emerald-700'
                    : 'text-[11px] text-stone-500'
                }
              >
                {r.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
