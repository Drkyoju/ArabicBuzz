'use client'

import { useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useCanvasStore, type CanvasArtifact } from '@/lib/canvas/store'
import { cn } from '@/lib/utils'

export function CanvasViewer({
  onPersist,
  onClose,
  className,
}: {
  onPersist?: (artifact: CanvasArtifact) => void | Promise<void>
  onClose?: () => void
  className?: string
}) {
  const {
    artifacts,
    activeId,
    setEditing,
    setContent,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
  } = useCanvasStore()
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0]
  const [status, setStatus] = useState('')

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

  async function persist() {
    if (!onPersist) {
      setStatus('المشاركة غير مفعّلة')
      return
    }
    try {
      await onPersist(active!)
      setStatus('تمت المشاركة مع الغرفة')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'فشلت المشاركة')
    }
  }

  const tech = ['code', 'json', 'diff'].includes(active.type)

  return (
    <div className={cn('flex h-full flex-col bg-ab-surface', className)}>
      <div className="flex items-center gap-2 border-b border-ab-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ab-ink">
          {active.titleAr}
        </h2>
        {(active.updatedBy || active.updatedAt) && (
          <p className="hidden max-w-[10rem] truncate text-[10px] text-stone-400 sm:block" dir="ltr">
            {active.updatedBy || '—'}
            {active.updatedAt
              ? ` · ${new Date(active.updatedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`
              : ''}
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1">
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
    </div>
  )
}
