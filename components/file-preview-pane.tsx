'use client'

import { useEffect, useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  X,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import {
  useFilePreviewStore,
  type FilePreviewTarget,
} from '@/lib/files/preview-store'
import { cn } from '@/lib/utils'

type PreviewPayload = {
  ok?: boolean
  name?: string
  mimeType?: string
  size?: number
  kind?: string
  text?: string | null
  truncated?: boolean
  charCount?: number
  downloadPath?: string
  previewMode?: 'image' | 'pdf' | 'text' | 'binary'
  error?: string
}

function fmtSize(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

async function downloadFile(file: FilePreviewTarget) {
  const path =
    `/api/storage/file?id=${encodeURIComponent(file.fileId)}&scopeId=${encodeURIComponent(file.scopeId)}`
  const res = await fetch(path, { headers: await authHeaders() })
  if (!res.ok) throw new Error('فشل التنزيل')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}

export function FilePreviewPane({
  onClose,
  className,
}: {
  onClose?: () => void
  className?: string
}) {
  const file = useFilePreviewStore((s) => s.file)
  const revision = useFilePreviewStore((s) => s.revision)
  const bumpRevision = useFilePreviewStore((s) => s.bumpRevision)
  const closePreview = useFilePreviewStore((s) => s.closePreview)

  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [liveHint, setLiveHint] = useState(false)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    let objectUrl: string | null = null

    async function loadBinary(downloadPath?: string) {
      const bin = await fetch(
        downloadPath ||
          `/api/storage/file?id=${encodeURIComponent(file!.fileId)}&scopeId=${encodeURIComponent(file!.scopeId)}`,
        { headers: await authHeaders() }
      )
      if (!bin.ok) throw new Error('تعذّر جلب الملف للمعاينة')
      const blob = await bin.blob()
      objectUrl = URL.createObjectURL(blob)
      if (!cancelled) setMediaUrl(objectUrl)
    }

    function guessVisualMode(): 'image' | 'pdf' | null {
      const mime = (file!.mimeType || '').toLowerCase()
      const name = file!.name.toLowerCase()
      if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?)$/i.test(name))
        return 'image'
      if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
      return null
    }

    async function load() {
      setLoading(true)
      setError('')
      setLiveHint(revision > 1)
      try {
        const ac = new AbortController()
        const kill = window.setTimeout(() => ac.abort(), 10_000)
        let metaRes: Response | null = null
        let meta: PreviewPayload | null = null
        try {
          metaRes = await fetch(
            `/api/storage/preview?id=${encodeURIComponent(file!.fileId)}&scopeId=${encodeURIComponent(file!.scopeId)}`,
            { headers: await authHeaders(), signal: ac.signal }
          )
          const raw = await metaRes.text()
          if (raw.trim()) {
            try {
              meta = JSON.parse(raw) as PreviewPayload
            } catch {
              meta = null
            }
          }
        } catch {
          metaRes = null
          meta = null
        } finally {
          window.clearTimeout(kill)
        }

        if (!metaRes?.ok || !meta?.ok) {
          // Netlify 502 / timeout / empty body: still try visual load from known mime/name.
          const fallback = guessVisualMode()
          if (fallback) {
            if (cancelled) return
            setPayload({
              ok: true,
              name: file!.name,
              mimeType: file!.mimeType,
              previewMode: fallback,
            })
            await loadBinary()
            return
          }
          throw new Error(
            meta?.error ||
              (metaRes?.status === 502
                ? 'تعذّرت المعاينة مؤقتاً (انتهت مهلة الخادم)'
                : `فشل المعاينة (${metaRes?.status || 'فارغ'})`)
          )
        }
        if (cancelled) return
        setPayload(meta)

        const mode = meta.previewMode || 'binary'
        if (mode === 'image' || mode === 'pdf') {
          await loadBinary(meta.downloadPath)
        } else {
          setMediaUrl(null)
        }
      } catch (e) {
        if (!cancelled) {
          const fallback = guessVisualMode()
          if (fallback) {
            try {
              setError('')
              setPayload({
                ok: true,
                name: file!.name,
                mimeType: file!.mimeType,
                previewMode: fallback,
              })
              await loadBinary()
              return
            } catch {
              /* fall through */
            }
          }
          setError(e instanceof Error ? e.message : 'تعذّرت المعاينة')
          setPayload(null)
          setMediaUrl(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file?.fileId, file?.scopeId, revision])

  if (!file) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-stone-500',
          className
        )}
        dir="rtl"
      >
        <Eye className="h-8 w-8 text-stone-300" />
        <p>افتح ملفاً من «ملفات» أو من مرفقات الشات لمعاينته هنا.</p>
      </div>
    )
  }

  const title = payload?.name || file.name
  const mode = payload?.previewMode || 'binary'

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col bg-ab-surface', className)}
      dir="rtl"
      aria-label="معاينة الملف"
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-ab-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {mode === 'image' ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ab-accent" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-ab-accent" />
            )}
            <h3 className="truncate text-[13px] font-bold text-ab-ink">
              {title}
            </h3>
          </div>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {fmtSize(payload?.size)}
            {payload?.mimeType ? ` · ${payload.mimeType}` : ''}
            {liveHint ? ' · تحديث مباشر' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="تحديث المعاينة"
            onClick={() => bumpRevision()}
            className="rounded-md border border-ab-border p-1.5 text-stone-600 hover:bg-stone-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            title="تنزيل"
            onClick={() => void downloadFile(file).catch((e) => setError(String(e)))}
            className="rounded-md border border-ab-border p-1.5 text-stone-600 hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="إغلاق"
            onClick={() => {
              closePreview()
              onClose?.()
            }}
            className="rounded-md border border-ab-border p-1.5 text-stone-600 hover:bg-stone-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <p className="shrink-0 border-b border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-[10px] text-emerald-900">
        اكتب في الشات ما تريد تعديله — تظهر النسخة الجديدة هنا تلقائياً بعد رد
        الوكيل.
      </p>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && !payload ? (
          <p className="text-sm text-stone-500">جاري فتح المعاينة…</p>
        ) : error ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {error}
          </p>
        ) : mode === 'image' && mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={title}
            className="mx-auto max-h-full max-w-full rounded-md border border-ab-border object-contain"
          />
        ) : mode === 'pdf' && mediaUrl ? (
          <iframe
            title={title}
            src={mediaUrl}
            className="h-full min-h-[24rem] w-full rounded-md border border-ab-border bg-white"
          />
        ) : mode === 'text' && payload?.text != null ? (
          <pre
            dir="auto"
            className="whitespace-pre-wrap break-words rounded-md border border-ab-border bg-white p-3 font-mono text-[12px] leading-relaxed text-ab-ink ltr:text-left"
          >
            {payload.text || '— فارغ —'}
          </pre>
        ) : (
          <div className="space-y-2 text-sm text-stone-600">
            <p>لا معاينة مرئية لهذه الصيغة في المتصفح.</p>
            <p className="text-xs text-stone-500">
              يمكنك تنزيل الملف أو طلب تعديله في الشات — سيظهر النص المستخرج إن
              وُجد.
            </p>
            {payload?.text ? (
              <pre
                dir="auto"
                className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-ab-border bg-white p-3 font-mono text-[11px]"
              >
                {payload.text}
              </pre>
            ) : null}
          </div>
        )}
        {payload?.truncated && (
          <p className="mt-2 text-[10px] text-stone-400">
            المعاينة مقتطعة للطول — الملف الكامل عبر التنزيل.
          </p>
        )}
      </div>
    </div>
  )
}
