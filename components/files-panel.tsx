'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type ListedFile = {
  id?: string
  originalName?: string
  name?: string
  relativePath?: string
  mimeType?: string
  sizeBytes?: number
  createdAt?: string
}

function fmtSize(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const scope = scopes.find((s) => s.id === scopeId)
  const [files, setFiles] = useState<ListedFile[]>([])
  const [source, setSource] = useState<string>('none')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        files?: ListedFile[]
        source?: string
        error?: string
      }
      setFiles(data.files || [])
      setSource(data.source || 'none')
      if (data.error) setError(data.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر التحميل')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [scopeId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">ملفات المساحة</h2>
          <p className="mt-1 text-sm text-stone-500">
            {scope?.nameAr || scopeId} —{' '}
            {source === 'local'
              ? 'خزنة محلية'
              : source === 'cloud'
                ? 'تخزين سحابي'
                : 'لا مصدر بعد'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
        >
          <RefreshCw className="h-3 w-3" />
          تحديث
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
        <p className="mb-2 text-xs font-semibold text-ab-ink">رفع ملف</p>
        <LocalUploadPanel scopeId={scopeId} onUploaded={() => void load()} />
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}

      {loading && files.length === 0 ? (
        <p className="text-sm text-stone-500">جاري التحميل…</p>
      ) : files.length === 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ab-border bg-gradient-to-bl from-stone-50 via-white to-emerald-50/40 px-6 py-14 text-center">
          <FileText
            className="mx-auto mb-3 h-10 w-10 text-stone-300"
            aria-hidden
          />
          <p className="text-base font-semibold text-ab-ink">لا ملفات بعد</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            ارفع مستنداً من الأعلى أو من شريط الكتابة في الغرفة — سيظهر هنا للمعاينة
            والتنزيل.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((f, i) => {
            const name = f.originalName || f.name || f.relativePath || `ملف ${i + 1}`
            const path = f.relativePath || f.id || ''
            const href = path
              ? `/api/storage/file?path=${encodeURIComponent(path)}&scopeId=${encodeURIComponent(scopeId)}`
              : undefined
            return (
              <li
                key={f.id || path || String(i)}
                className="flex items-center justify-between gap-3 rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ab-ink">
                    {name}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    {fmtSize(f.sizeBytes)}
                    {f.mimeType ? ` · ${f.mimeType}` : ''}
                  </p>
                </div>
                {href && (
                  <a
                    href={href}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-50"
                    download
                  >
                    <Download className="h-3 w-3" />
                    تنزيل
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
