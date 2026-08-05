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
  macOnline?: boolean
  macConfigured?: boolean
  modelsReady?: number
  pendingApprovals?: number
  mcpConnectedServers?: number
  mcpConnectedTools?: number
  mcpCatalogCount?: number
  langfuseConfigured?: boolean
  braveConfigured?: boolean
  firecrawlConfigured?: boolean
  mcpToolboxConfigured?: boolean
  steelConfigured?: boolean
  browserUseConfigured?: boolean
  browserRpaConfigured?: boolean
  tokenrouterAvailable?: boolean
  tokenrouterStatusAr?: string
}

/**
 * Lightweight ops health panel (not full evals UI).
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
        driveFiles: Number(drive?.count || 0),
        zoomConfigured: Boolean(integ?.zoomConfigured),
        telegramConfigured: Boolean(integ?.telegramConfigured),
        telegramOwnerConfigured: Boolean(integ?.telegramOwnerConfigured),
        channelOwnerConfigured: Boolean(integ?.channelOwnerConfigured),
        triggerDispatchConfigured: Boolean(integ?.triggerDispatchConfigured),
        macOnline: Boolean(mac?.online),
        macConfigured: Boolean(mac?.configured || integ?.macSyncConfigured),
        modelsReady: Number(providers?.serviceableCount || 0),
        pendingApprovals: Array.isArray(approvals?.approvals)
          ? approvals.approvals.filter(
              (a: { status?: string }) => a.status === 'PENDING_APPROVAL'
            ).length
          : 0,
        mcpConnectedServers: Number(integ?.mcpConnectedServers || 0),
        mcpConnectedTools: Number(integ?.mcpConnectedTools || 0),
        mcpCatalogCount: Number(integ?.mcpCatalogCount || 0),
        langfuseConfigured: Boolean(integ?.langfuseConfigured),
        braveConfigured: Boolean(integ?.braveConfigured),
        firecrawlConfigured: Boolean(integ?.firecrawlConfigured),
        mcpToolboxConfigured: Boolean(integ?.mcpToolboxConfigured),
        steelConfigured: Boolean(integ?.steelConfigured),
        browserUseConfigured: Boolean(integ?.browserUseConfigured),
        browserRpaConfigured: Boolean(integ?.browserRpaConfigured),
        tokenrouterAvailable: Boolean(integ?.tokenrouterAvailable),
        tokenrouterStatusAr: String(integ?.tokenrouterStatusAr || ''),
      })
    } catch (e) {
      setSnap(null)
      setError(
        e instanceof Error ? e.message : 'تعذّر تحميل صحة التشغيل'
      )
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
          label: 'Langfuse (تتبّع)',
          ok: Boolean(snap.langfuseConfigured),
          detail: snap.langfuseConfigured ? 'مباشر' : 'غير مضبوط',
        },
        {
          label: 'Brave Search',
          ok: Boolean(snap.braveConfigured),
          detail: snap.braveConfigured ? 'مباشر' : 'غير مضبوط',
        },
        {
          label: 'Firecrawl',
          ok: Boolean(snap.firecrawlConfigured),
          detail: snap.firecrawlConfigured ? 'مباشر' : 'غير مضبوط',
        },
        {
          label: 'MCP Toolbox',
          ok: Boolean(snap.mcpToolboxConfigured),
          detail: snap.mcpToolboxConfigured ? 'مباشر' : 'غير مضبوط',
        },
        {
          label: 'جسر الماك',
          ok: Boolean(snap.macOnline),
          detail: snap.macOnline
            ? 'متصل'
            : snap.macConfigured
              ? 'مضبوط · غير متصل'
              : 'غير مضبوط',
        },
        {
          label: 'browser-use',
          ok: Boolean(snap.browserUseConfigured || snap.macConfigured),
          detail: snap.browserUseConfigured
            ? 'BROWSER_USE_URL'
            : snap.macConfigured
              ? 'عبر جسر الماك'
              : 'غير مضبوط',
        },
        {
          label: 'Steel (احتياطي)',
          ok: Boolean(snap.steelConfigured),
          detail: snap.steelConfigured ? 'مباشر' : 'غير مضبوط',
        },
        {
          label: 'أتمتة المتصفح (HITL)',
          ok: Boolean(snap.browserRpaConfigured),
          detail: snap.browserRpaConfigured
            ? 'browser-use → ماك → Steel'
            : 'غير مضبوط',
        },
        {
          label: 'TokenRouter',
          ok: Boolean(snap.tokenrouterAvailable),
          detail: snap.tokenrouterAvailable
            ? 'متاح'
            : snap.tokenrouterStatusAr || 'متوقف',
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
          label: 'تيليجرام',
          ok: Boolean(snap.telegramConfigured),
          detail: snap.telegramConfigured ? 'مضبوط' : 'غير مضبوط',
        },
        {
          label: 'أدوات MCP',
          ok: (snap.mcpConnectedServers || 0) > 0,
          detail: `${snap.mcpConnectedServers || 0} خادم · ${snap.mcpConnectedTools || 0} أداة · كتالوج ${snap.mcpCatalogCount || 0}`,
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
            صحة التشغيل
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            نظرة سريعة على التكاملات والنماذج — Langfuse وBrave وFirecrawl والجسور.
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
                dir={r.label === 'TokenRouter' ? 'rtl' : undefined}
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
