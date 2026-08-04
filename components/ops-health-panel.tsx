'use client'

import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type Snapshot = {
  googleConnected?: boolean
  driveFiles?: number
  zoomConfigured?: boolean
  telegramConfigured?: boolean
  telegramOwnerConfigured?: boolean
  channelOwnerConfigured?: boolean
  triggerDispatchConfigured?: boolean
  whatsappConfigured?: boolean
  whatsappOwnerConfigured?: boolean
  macOnline?: boolean
  macConfigured?: boolean
  modelsReady?: number
  pendingApprovals?: number
  whatsappPending?: number
}

/**
 * Lightweight ops health panel (not full evals UI).
 */
export function OpsHealthPanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    try {
      const h = await authHeaders()
      const [cal, drive, integ, mac, providers, approvals, waInbox] =
        await Promise.all([
          fetch('/api/google/calendar?action=status', { headers: h }).then(
            (r) => r.json()
          ),
          fetch('/api/google/drive/brain', { headers: h }).then((r) => r.json()),
          fetch('/api/integrations/status').then((r) => r.json()),
          fetch('/api/mac/status', { headers: h }).then((r) => r.json()),
          fetch('/api/settings/providers').then((r) => r.json()),
          fetch('/api/agent/approvals', { headers: h }).then((r) => r.json()),
          fetch('/api/whatsapp/inbox', { headers: h }).then((r) => r.json()),
        ])
      setSnap({
        googleConnected: Boolean(cal?.connected),
        driveFiles: Number(drive?.count || 0),
        zoomConfigured: Boolean(integ?.zoomConfigured),
        telegramConfigured: Boolean(integ?.telegramConfigured),
        telegramOwnerConfigured: Boolean(integ?.telegramOwnerConfigured),
        channelOwnerConfigured: Boolean(integ?.channelOwnerConfigured),
        triggerDispatchConfigured: Boolean(integ?.triggerDispatchConfigured),
        whatsappConfigured: Boolean(integ?.whatsappConfigured),
        whatsappOwnerConfigured: Boolean(integ?.whatsappOwnerConfigured),
        macOnline: Boolean(mac?.online),
        macConfigured: Boolean(mac?.configured || integ?.macSyncConfigured),
        modelsReady: Number(providers?.serviceableCount || 0),
        pendingApprovals: Array.isArray(approvals?.approvals)
          ? approvals.approvals.filter(
              (a: { status?: string }) => a.status === 'PENDING_APPROVAL'
            ).length
          : 0,
        whatsappPending: Number(waInbox?.count || 0),
      })
    } catch {
      setSnap({})
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
          detail: `${snap.modelsReady || 0} جاهز`,
        },
        {
          label: 'تقويم Google',
          ok: Boolean(snap.googleConnected),
          detail: snap.googleConnected ? 'مربوط' : 'غير مربوط',
        },
        {
          label: 'عقل Drive',
          ok: (snap.driveFiles || 0) > 0,
          detail: `${snap.driveFiles || 0} ملف`,
        },
        {
          label: 'Zoom API',
          ok: Boolean(snap.zoomConfigured),
          detail: snap.zoomConfigured ? 'مضبوط' : 'غير مضبوط',
        },
        {
          label: 'Telegram',
          ok: Boolean(snap.telegramConfigured),
          detail: snap.telegramConfigured ? 'مضبوط' : 'غير مضبوط',
        },
        {
          label: 'Telegram مالك',
          ok: Boolean(snap.telegramOwnerConfigured),
          detail: snap.telegramOwnerConfigured
            ? 'مضبوط'
            : 'أرسل /start للبوت لربط المحادثة',
        },
        {
          label: 'مالك القنوات (Google)',
          ok: Boolean(snap.channelOwnerConfigured),
          detail: snap.channelOwnerConfigured ? 'مضبوط' : 'CHANNEL_OWNER_USER_ID',
        },
        {
          label: 'توزيع غير متزامن',
          ok: Boolean(snap.triggerDispatchConfigured),
          detail: snap.triggerDispatchConfigured ? 'جاهز' : 'غير مضبوط',
        },
        {
          label: 'WhatsApp',
          ok: Boolean(snap.whatsappConfigured),
          detail: snap.whatsappConfigured ? 'مضبوط' : 'غير مضبوط',
        },
        {
          label: 'WhatsApp مالك',
          ok: Boolean(snap.whatsappOwnerConfigured),
          detail: snap.whatsappOwnerConfigured ? 'مضبوط' : 'غير مضبوط',
        },
        {
          label: 'خزنة الماك',
          ok: Boolean(snap.macOnline),
          detail: snap.macOnline
            ? 'متصلة'
            : snap.macConfigured
              ? 'مضبوطة · غير متصلة'
              : 'غير مضبوطة',
        },
        {
          label: 'موافقات معلّقة',
          ok: (snap.pendingApprovals || 0) === 0,
          detail: String(snap.pendingApprovals || 0),
        },
        {
          label: 'وارد واتساب معلّق',
          ok: (snap.whatsappPending || 0) === 0,
          detail: String(snap.whatsappPending || 0),
        },
      ]
    : []

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Activity className="h-5 w-5 text-ab-accent" aria-hidden />
            صحة التشغيل
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            نظرة سريعة على التكاملات والنماذج — ليست تقييماً لجودة الردود.
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
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-ab-border bg-ab-surface px-3 py-2.5 text-sm"
          >
            <span className="font-medium text-ab-ink">{r.label}</span>
            <span
              className={
                r.ok
                  ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800'
                  : 'rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900'
              }
            >
              {r.detail}
            </span>
          </li>
        ))}
      </ul>
      {!snap && (
        <p className="mt-4 text-sm text-stone-500">جاري التحميل…</p>
      )}
    </section>
  )
}
