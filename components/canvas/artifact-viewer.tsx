'use client'

import { useEffect, useState } from 'react'
import { CheckCheck, Maximize2, Minimize2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useCanvasStore, type CanvasArtifact } from '@/lib/canvas/store'
import { authHeaders } from '@/lib/supabase/browser'
import { looksLikeDecisionOrMinutes } from '@/lib/rooms/item-acks'
import { cn } from '@/lib/utils'
import { sdaiaPdfFooterHtml } from '@/components/sdaia-badge'

function buildRtlPdfHtml(title: string, content: string, tech: boolean) {
  const escapedTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const body = tech
    ? `<pre dir="ltr" style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;text-align:left;background:#1c1917;color:#f5f5f4;padding:16px;border-radius:8px">${content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`
    : `<article dir="rtl" style="white-space:pre-wrap;font-size:14px;line-height:1.85">${content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')}</article>`
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"/><title>${escapedTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  @page { margin: 18mm; }
  body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;padding:8px 12px;line-height:1.7;color:#1c1917;max-width:720px;margin:0 auto}
  h1{font-size:20px;margin:0 0 16px;font-weight:600}
  .badge{display:inline-block;font-size:10px;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:2px 8px;margin-bottom:12px}
</style></head><body>
<span class="badge">ختم التدقيق</span>
<h1>${escapedTitle}</h1>
${body}
${sdaiaPdfFooterHtml()}
</body></html>`
}

export function CanvasViewer({
  onPersist,
  onClose,
  className,
  scopeId,
}: {
  onPersist?: (artifact: CanvasArtifact) => void | Promise<void>
  onClose?: () => void
  className?: string
  scopeId?: string
}) {
  const {
    artifacts,
    activeId,
    setEditing,
    setContent,
    approveArtifact,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
  } = useCanvasStore()
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0]
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [pdfPreview, setPdfPreview] = useState(false)
  const [driveConfirm, setDriveConfirm] = useState(false)
  const [acks, setAcks] = useState<Array<{ userAr: string }>>([])
  const [seenByMe, setSeenByMe] = useState(false)
  const showAck =
    Boolean(active) &&
    looksLikeDecisionOrMinutes(
      `${active?.titleAr || ''} ${active?.content?.slice(0, 200) || ''}`
    )

  useEffect(() => {
    if (!showAck || !active?.id) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/rooms/acks?itemKind=canvas&itemId=${encodeURIComponent(active.id)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          acks?: Array<{ userAr: string }>
          seenByMe?: boolean
        }
        setAcks(data.acks || [])
        setSeenByMe(Boolean(data.seenByMe))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showAck, active?.id])

  if (!active) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-stone-500',
          className
        )}
      >
        <p>لا توجد مخرجات بعد — ستظهر هنا عند إنتاج الوكيل لمستند أو كود.</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-ab-accent hover:underline"
          >
            إغلاق اللوحة
          </button>
        )}
      </div>
    )
  }

  const tech = ['code', 'json', 'diff'].includes(active.type)

  async function copy() {
    try {
      await navigator.clipboard.writeText(active!.content)
      setStatus('تم النسخ')
    } catch {
      setStatus('تعذّر النسخ')
    }
  }

  function download() {
    const blob = new Blob([active!.content], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = active!.titleAr || 'artifact.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  function openPdfPrint() {
    const title = active!.titleAr || 'مستند'
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      setStatus('اسمح بالنوافذ المنبثقة لتصدير PDF')
      return
    }
    w.document.write(buildRtlPdfHtml(title, active!.content, tech))
    w.document.close()
    setTimeout(() => {
      try {
        w.print()
      } catch {
        /* ignore */
      }
    }, 400)
    setStatus('افتح حوار الطباعة واختر «حفظ كـ PDF»')
    setPdfPreview(false)
  }

  async function saveToDrive() {
    setBusy(true)
    setStatus('جاري الحفظ في Drive…')
    setDriveConfirm(false)
    try {
      const res = await fetch('/api/google/drive/artifact', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          titleAr: active!.titleAr,
          content: active!.content,
          type: active!.type,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        webViewLink?: string | null
      }
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')
      setStatus(data.messageAr || 'حُفظ في Drive')
      if (data.webViewLink) {
        window.open(data.webViewLink, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'فشل الحفظ في Drive')
    } finally {
      setBusy(false)
    }
  }

  async function persist() {
    if (!onPersist) {
      setStatus('المشاركة غير مفعّلة')
      return
    }
    try {
      await onPersist(active!)
      approveArtifact(active!.id)
      setStatus('تمت المشاركة مع الغرفة')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'فشلت المشاركة')
    }
  }

  async function approveAndPersist() {
    if (onPersist) {
      try {
        await onPersist(active!)
        approveArtifact(active!.id)
        setStatus('اعتُمدت المسودة وحُفظت في الغرفة')
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'فشل الاعتماد')
      }
      return
    }
    approveArtifact(active!.id)
    setStatus('اعتُمدت المسودة محلياً')
  }

  return (
    <div className={cn('relative flex h-full flex-col bg-ab-surface', className)}>
      {active.pendingReview && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span>مسودة من الوكيل — راجع المحتوى ثم اعتمد للحفظ في الغرفة.</span>
          <button
            type="button"
            onClick={() => void approveAndPersist()}
            className="rounded-md bg-ab-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            اعتماد وحفظ
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-ab-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ab-ink">
          {active.titleAr}
        </h2>
        {(active.updatedBy || active.updatedAt) && (
          <p
            className="hidden max-w-[10rem] truncate text-[10px] text-ab-muted-soft sm:block"
            dir="ltr"
          >
            {active.updatedBy || '—'}
            {active.updatedAt
              ? ` · ${new Date(active.updatedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`
              : ''}
          </p>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {showAck && scopeId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    const res = await fetch('/api/rooms/acks', {
                      method: 'POST',
                      headers: await authHeaders({
                        'Content-Type': 'application/json',
                      }),
                      body: JSON.stringify({
                        scopeId,
                        itemKind: 'canvas',
                        itemId: active.id,
                        seen: !seenByMe,
                      }),
                    })
                    const data = (await res.json()) as {
                      acks?: Array<{ userAr: string }>
                      seen?: boolean
                      error?: string
                    }
                    if (!res.ok) throw new Error(data.error || 'فشل')
                    setAcks(data.acks || [])
                    setSeenByMe(Boolean(data.seen))
                    setStatus(
                      data.seen ? 'سُجّل اطّلاعك' : 'أُلغي الاطّلاع'
                    )
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : 'فشل')
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-stone-50',
                seenByMe
                  ? 'font-semibold text-emerald-700'
                  : 'text-ab-accent'
              )}
              title={
                acks.length
                  ? `اطّلع: ${acks.map((a) => a.userAr).join(' · ')}`
                  : 'سجّل أنك اطّلعت على القرار/المحضر'
              }
            >
              <CheckCheck className="h-3 w-3" />
              {seenByMe ? 'اطّلعت ✓' : 'اطّلعت'}
              {acks.length > 0 ? ` · ${acks.length}` : ''}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50"
          >
            نسخ
          </button>
          <button
            type="button"
            onClick={() => setEditing(active.id, !active.isEditing)}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50"
          >
            {active.isEditing ? 'عرض' : 'تعديل'}
          </button>
          <button
            type="button"
            onClick={() => void persist()}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50"
          >
            مشاركة
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50"
          >
            تحميل
          </button>
          <button
            type="button"
            onClick={() => setPdfPreview(true)}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50"
            title="معاينة RTL ثم طباعة PDF"
          >
            PDF
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDriveConfirm(true)}
            className="rounded px-2 py-1 text-[11px] text-ab-accent hover:bg-stone-50 disabled:opacity-40"
            title="معاينة ثم حفظ في عقل الشركة على Drive"
          >
            Drive
          </button>
          <button
            type="button"
            onClick={toggleCanvasFullscreen}
            className="rounded p-1.5 text-stone-500 hover:bg-stone-100"
            aria-label={isCanvasFullscreen ? 'تصغير اللوحة' : 'توسيع اللوحة'}
            title={isCanvasFullscreen ? 'تصغير' : 'توسيع'}
          >
            {isCanvasFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          {onClose && !isCanvasFullscreen && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-stone-500 hover:bg-stone-100"
              aria-label="إغلاق اللوحة"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {status && (
        <p className="border-b border-ab-border px-3 py-1 text-[10px] text-stone-500">
          {status}
        </p>
      )}
      <div className="flex-1 overflow-auto p-4">
        {active.isEditing ? (
          <textarea
            dir={tech ? 'ltr' : 'rtl'}
            className="h-full w-full rounded-lg border border-ab-border bg-white p-3 font-mono text-sm"
            value={active.content}
            onChange={(e) => {
              setContent(active.id, e.target.value)
            }}
            onBlur={() => void persist()}
          />
        ) : tech ? (
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-lg bg-stone-900 p-4 text-left text-sm text-stone-100"
          >
            <code>{active.content}</code>
          </pre>
        ) : (
          <div dir="rtl" className="prose prose-sm max-w-none">
            <ReactMarkdown>{active.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {(pdfPreview || driveConfirm) && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div
            className="max-h-[85%] w-full max-w-lg overflow-auto rounded-xl bg-white p-4 shadow-xl"
            dir="rtl"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ab-ink">
                  {pdfPreview
                    ? 'معاينة PDF (عربي RTL)'
                    : 'معاينة قبل الحفظ في Drive'}
                </p>
                <p className="text-[11px] text-stone-500">{active.titleAr}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPdfPreview(false)
                  setDriveConfirm(false)
                }}
                className="rounded p-1 text-ab-muted-soft hover:bg-stone-100"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 max-h-64 overflow-auto rounded-lg border border-ab-border bg-stone-50 p-3 text-sm leading-relaxed">
              {tech ? (
                <pre
                  dir="ltr"
                  className="whitespace-pre-wrap text-left font-mono text-[11px]"
                >
                  {active.content.slice(0, 4000)}
                </pre>
              ) : (
                <div dir="rtl" className="whitespace-pre-wrap text-[13px]">
                  {active.content.slice(0, 4000)}
                </div>
              )}
            </div>
            <p className="mb-3 text-[10px] text-emerald-800">
              سيُختم المستند بعبارة «ختم التدقيق» في التذييل.
            </p>
            <div className="flex flex-wrap gap-2">
              {pdfPreview && (
                <button
                  type="button"
                  onClick={openPdfPrint}
                  className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  طباعة / حفظ PDF
                </button>
              )}
              {driveConfirm && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveToDrive()}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  تأكيد الحفظ في Drive
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPdfPreview(false)
                  setDriveConfirm(false)
                }}
                className="rounded-md border border-ab-border px-3 py-1.5 text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
