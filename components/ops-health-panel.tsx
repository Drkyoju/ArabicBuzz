'use client'

import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type Snapshot = {
  googleConnected?: boolean
  driveReady?: boolean
  zoomConfigured?: boolean
  telegramConfigured?: boolean
  telegramOutboundReady?: boolean
  telegramOwnerConfigured?: boolean
  telegramDetailAr?: string
  kimiDetailAr?: string
  macOnline?: boolean
  macConfigured?: boolean
  modelsReady?: number
  pendingApprovals?: number
  searchReady?: boolean
  crawlReady?: boolean
  searchDetailAr?: string
  crawlDetailAr?: string
  langfuseDetailAr?: string
  toolsReady?: boolean
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 12_000
): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

function telegramDetailAr(integ: Record<string, unknown> | null): string {
  if (!integ?.telegramConfigured) {
    return 'اختياري — يحتاج TELEGRAM_BOT_TOKEN'
  }
  if (integ.telegramOutboundReady) {
    return 'متصل · الإرسال جاهز (خاص أو مجموعة مربوطة)'
  }
  if (integ.telegramOwnerConfigured) {
    return 'البوت جاهز · افتح رابط «ربط هذه المساحة» من الإعدادات'
  }
  return 'البوت جاهز · اربط محادثة خاصة عبر /start أو أضف المجموعة'
}

/**
 * High-level connection status for directors/admins.
 * Free web paths show «مجاني مدمج» — not red “broken” without Brave/Firecrawl.
 */
export function OpsHealthPanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      const h = await Promise.race([
        authHeaders(),
        new Promise<HeadersInit>((resolve) =>
          window.setTimeout(() => resolve({}), 4_000)
        ),
      ])
      const [cal, drive, integ, mac, providers, approvals] = await Promise.all([
        fetchJson('/api/google/calendar?action=status', { headers: h }),
        fetchJson('/api/google/drive/brain', { headers: h }),
        fetchJson('/api/integrations/status', undefined, 18_000),
        fetchJson('/api/mac/status', { headers: h }),
        fetchJson('/api/settings/providers', undefined, 18_000),
        fetchJson('/api/agent/approvals', { headers: h }),
      ])

      if (!integ && !providers) {
        throw new Error('تعذّر تحميل حالة الربط — أعد المحاولة')
      }

      const tokenrouterStatusAr =
        typeof integ?.tokenrouterStatusAr === 'string'
          ? integ.tokenrouterStatusAr
          : null

      setSnap({
        googleConnected: Boolean(cal?.connected),
        driveReady: Number(drive?.count || 0) > 0,
        zoomConfigured: Boolean(integ?.zoomConfigured),
        telegramConfigured: Boolean(integ?.telegramConfigured),
        telegramOutboundReady: Boolean(integ?.telegramOutboundReady),
        telegramOwnerConfigured: Boolean(integ?.telegramOwnerConfigured),
        telegramDetailAr: telegramDetailAr(integ),
        kimiDetailAr: tokenrouterStatusAr || undefined,
        macOnline: Boolean(mac?.online),
        macConfigured: Boolean(mac?.configured || integ?.macSyncConfigured),
        modelsReady: Number(providers?.serviceableCount || 0),
        pendingApprovals: Array.isArray(approvals?.approvals)
          ? (approvals.approvals as Array<{ status?: string }>).filter(
              (a) => a.status === 'PENDING_APPROVAL'
            ).length
          : 0,
        searchReady: Boolean(
          integ?.webSearchReady ?? integ?.webSearchFreePath ?? true
        ),
        crawlReady: Boolean(
          integ?.webCrawlReady ?? integ?.webCrawlFreePath ?? true
        ),
        searchDetailAr:
          typeof integ?.braveStatusAr === 'string'
            ? integ.braveStatusAr
            : 'مجاني مدمج',
        crawlDetailAr:
          typeof integ?.firecrawlStatusAr === 'string'
            ? integ.firecrawlStatusAr
            : 'مجاني مدمج',
        langfuseDetailAr:
          typeof integ?.langfuseStatusAr === 'string'
            ? integ.langfuseStatusAr
            : 'يحتاج مفتاح مجاني من cloud.langfuse.com',
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

  const rows: Array<{
    label: string
    ok: boolean
    detail: string
    soft?: boolean
  }> = snap
    ? [
        {
          label: 'نماذج المحادثة',
          ok: (snap.modelsReady || 0) > 0,
          detail:
            (snap.modelsReady || 0) > 0
              ? `${snap.modelsReady} جاهز`
              : 'غير متصل',
        },
        {
          label: 'Kimi Free',
          ok: Boolean(
            snap.kimiDetailAr?.includes('جاهز') ||
              snap.kimiDetailAr?.includes('مفعّل')
          ),
          detail: /رصيد|منته|quota/i.test(snap.kimiDetailAr || '')
            ? 'رصيد منتهٍ'
            : snap.kimiDetailAr || 'غير مضبوط',
          soft: true,
        },
        {
          label: 'البحث على الويب',
          ok: Boolean(snap.searchReady),
          detail: snap.searchDetailAr || 'مجاني مدمج',
        },
        {
          label: 'جلب صفحات الويب',
          ok: Boolean(snap.crawlReady),
          detail: snap.crawlDetailAr || 'مجاني مدمج',
        },
        {
          label: 'تتبع Langfuse',
          ok: Boolean(
            snap.langfuseDetailAr?.includes('مفعّل') &&
              !snap.langfuseDetailAr?.includes('يحتاج')
          ),
          detail:
            snap.langfuseDetailAr ||
            'يحتاج مفتاح مجاني من cloud.langfuse.com',
          soft: true,
        },
        {
          label: 'أدوات إضافية (MCP)',
          ok: Boolean(snap.toolsReady),
          detail: snap.toolsReady ? 'متصل' : 'غير مضبوط',
          soft: !snap.toolsReady,
        },
        {
          label: 'خزنة الجهاز (Mac)',
          ok: Boolean(snap.macOnline),
          detail: snap.macOnline
            ? 'متصل'
            : snap.macConfigured
              ? 'غير متصل'
              : 'غير مضبوط',
          soft: !snap.macOnline,
        },
        {
          label: 'تقويم Google',
          ok: Boolean(snap.googleConnected),
          detail: snap.googleConnected ? 'متصل' : 'اختياري',
          soft: !snap.googleConnected,
        },
        {
          label: 'ملفات Drive',
          ok: Boolean(snap.driveReady),
          detail: snap.driveReady ? 'متصل' : 'اختياري',
          soft: !snap.driveReady,
        },
        {
          label: 'تيليجرام',
          ok: Boolean(snap.telegramOutboundReady || snap.telegramConfigured),
          detail: snap.telegramDetailAr || 'اختياري',
          soft: !snap.telegramConfigured,
        },
        {
          label: 'اجتماعات Zoom',
          ok: Boolean(snap.zoomConfigured),
          detail: snap.zoomConfigured ? 'متصل' : 'اختياري',
          soft: !snap.zoomConfigured,
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
            البحث والزحف يعملان مجاناً بدون مفاتيح. Brave / Firecrawl / Langfuse
            اختياري. تيليجرام: بوت واحد — محادثة خاصة للتنبيهات أو مجموعة
            للجان.
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
                    ? 'max-w-[60%] text-end text-[11px] text-emerald-700'
                    : r.soft
                      ? 'max-w-[60%] text-end text-[11px] text-amber-700/90'
                      : 'max-w-[60%] text-end text-[11px] text-stone-500'
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
