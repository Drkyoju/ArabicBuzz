'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Link2,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  Unplug,
  ExternalLink,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'
import type { McpCatalogItem } from '@/lib/mcp/catalog'

type Connected = {
  id: string
  name: string
  transport: string
  commandOrUrl: string
  tools: Array<{ name: string; description?: string }>
}

/**
 * Arabic MCP catalog + connect/disconnect for the website settings.
 */
export function McpServersPanel() {
  const [catalog, setCatalog] = useState<McpCatalogItem[]>([])
  const [servers, setServers] = useState<Connected[]>([])
  const [toolCount, setToolCount] = useState(0)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [filter, setFilter] = useState<'all' | 'remote' | 'local'>('all')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/servers', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as {
        catalog?: McpCatalogItem[]
        servers?: Connected[]
        toolCount?: number
        netlifyNoteAr?: string
      }
      setCatalog(data.catalog || [])
      setServers(data.servers || [])
      setToolCount(Number(data.toolCount || 0))
      setNote(data.netlifyNoteAr || '')
    } catch {
      setErr('تعذّر تحميل كتالوج MCP')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const connectedIds = useMemo(
    () => new Set(servers.map((s) => s.id)),
    [servers]
  )

  const visible = useMemo(() => {
    return catalog.filter((c) => {
      if (filter === 'remote') return c.runtime === 'remote' || c.runtime === 'both'
      if (filter === 'local') return c.runtime === 'local' || c.runtime === 'both'
      return true
    })
  }, [catalog, filter])

  async function connectItem(item: McpCatalogItem, urlOverride?: string) {
    setBusyId(item.id)
    setErr('')
    setMsg('')
    try {
      const url = (urlOverride || item.defaultUrl || '').trim()
      const body: Record<string, unknown> = {
        catalogId: item.id,
        id: item.id,
        name: item.nameAr,
        nameAr: item.nameAr,
        transport: 'sse',
      }
      if (url) {
        body.url = url
        body.commandOrUrl = url
      }
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || data.messageAr || 'فشل الاتصال')
      setMsg(data.messageAr || `تم ربط ${item.nameAr}`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusyId(null)
    }
  }

  async function disconnect(id: string) {
    setBusyId(id)
    setErr('')
    try {
      const res = await fetch(
        `/api/mcp/servers?id=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: await authHeaders() }
      )
      const data = (await res.json()) as { messageAr?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الفصل')
      setMsg(data.messageAr || 'تم الفصل')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusyId(null)
    }
  }

  async function connectCustom() {
    const url = customUrl.trim()
    if (!url) {
      setErr('الصق رابط MCP (https://…)')
      return
    }
    setBusyId('custom')
    setErr('')
    try {
      const id = `custom-${Date.now().toString(36)}`
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id,
          name: 'خادم مخصص',
          nameAr: 'خادم مخصص',
          transport: 'sse',
          url,
          commandOrUrl: url,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تم الربط')
      setCustomUrl('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-xl border border-ab-border bg-ab-surface p-4" dir="rtl">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold text-ab-ink">
            <PlugZap className="h-4 w-4 text-ab-accent" aria-hidden />
            أدوات خارجية
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ab-muted">
            خوادم توسّع قدرات الوكيل (بحث، متصفح، قواعد بيانات…). كل بطاقة تشرح
            بالعربية ماذا تفعل.
          </p>
          <p className="mt-1 text-[11px] font-medium text-ab-accent">
            متصل الآن: {servers.length} خادم · {toolCount} أداة
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px]"
        >
          <RefreshCw className="h-3 w-3" />
          تحديث
        </button>
      </div>

      {note && (
        <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-900">
          {note}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {(
          [
            ['all', 'الكل'],
            ['remote', 'بعيد (Netlify)'],
            ['local', 'محلي / ماك'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-md px-2 py-1 text-[10px]',
              filter === id
                ? 'bg-ab-ink text-white'
                : 'border border-ab-border text-stone-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {visible.map((item) => {
          const on = connectedIds.has(item.id)
          return (
            <li
              key={item.id}
              className={cn(
                'rounded-xl border px-3 py-2.5',
                on ? 'border-emerald-200 bg-emerald-50/50' : 'border-ab-border bg-white'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ab-ink">
                    {item.nameAr}
                    {item.recommended && (
                      <span className="mr-1.5 rounded bg-ab-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-ab-accent">
                        موصى به
                      </span>
                    )}
                    {on && (
                      <span className="mr-1.5 text-[10px] font-medium text-emerald-700">
                        · متصل
                      </span>
                    )}
                    {!on && (
                      <span
                        className={
                          item.runtime === 'local'
                            ? 'mr-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500'
                            : item.defaultUrl
                              ? 'mr-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700'
                              : 'mr-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800'
                        }
                      >
                        {item.runtime === 'local'
                          ? 'يتطلب جهاز الماك'
                          : item.defaultUrl
                            ? 'متاح الآن'
                            : 'يحتاج رابطاً'}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ab-muted">
                    {item.descriptionAr}
                  </p>
                  <p className="mt-1 ab-meta">
                    {item.categoryAr} · الفائدة: {item.benefitsAr}
                  </p>
                  <p className="mt-0.5 ab-meta">
                    {item.setupHintAr}
                    {item.runtime === 'local' ? ' · محلي/ماك' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {on ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void disconnect(item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[10px] text-ab-warn"
                    >
                      {busyId === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unplug className="h-3 w-3" />
                      )}
                      فصل
                    </button>
                  ) : item.runtime !== 'local' ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => {
                        if (item.defaultUrl) {
                          void connectItem(item)
                          return
                        }
                        const u = window.prompt(
                          `الصق رابط MCP لـ «${item.nameAr}» (https://…)`
                        )
                        if (u?.trim()) void connectItem(item, u.trim())
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-ab-ink px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                    >
                      {busyId === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plug className="h-3 w-3" />
                      )}
                      {item.defaultUrl ? 'اتصال' : 'ربط برابط'}
                    </button>
                  ) : (
                    <span className="ab-meta">ماك فقط</span>
                  )}
                  {item.docsUrl && (
                    <a
                      href={item.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-ab-accent"
                    >
                      <ExternalLink className="h-3 w-3" />
                      وثائق
                    </a>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-lg border border-dashed border-ab-border p-3">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-ab-ink">
          <Link2 className="h-3.5 w-3.5" />
          ربط خادم بعيد برابط مخصص
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://…/mcp أو /sse"
            dir="ltr"
            className="min-w-[14rem] flex-1 rounded-md border border-ab-border px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busyId === 'custom'}
            onClick={() => void connectCustom()}
            className="rounded-md bg-ab-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            ربط
          </button>
        </div>
      </div>

      {servers.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold text-ab-ink">
            الأدوات النشطة من الخوادم المتصلة
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto text-[10px] text-stone-600">
            {servers.flatMap((s) =>
              s.tools.slice(0, 12).map((t) => (
                <li key={`${s.id}-${t.name}`}>
                  <span className="font-medium text-ab-ink">{s.name}</span>
                  {' · '}
                  <span dir="ltr">{t.name}</span>
                  {t.description ? ` — ${t.description.slice(0, 80)}` : ''}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {msg && (
        <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          {err}
        </p>
      )}
    </section>
  )
}
