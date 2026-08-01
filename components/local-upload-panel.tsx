'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Mic, Paperclip, Brain } from 'lucide-react'
import {
  checkBrowserRecordSupport,
  extForAudioMime,
  startBrowserRecording,
  type ActiveRecording,
} from '@/lib/audio/browser-record'
import { authHeaders } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

type StoredFile = {
  id: string
  kind: string
  originalName: string
  size: number
  createdAt: string
}

/**
 * Compact attach / Mac-save / brain toolbar for the session composer.
 */
export function LocalUploadPanel({
  scopeId,
  onUploaded,
  compact,
}: {
  scopeId: string
  onUploaded?: () => void
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<ActiveRecording | null>(null)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<StoredFile[]>([])
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    const headers = await authHeaders()
    const listRes = await fetch(
      `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`,
      { headers }
    )
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        files?: StoredFile[]
        error?: string
      }
      setFiles(data.files || [])
      if (data.error) setMessage(data.error)
    }
  }, [scopeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function uploadBlob(file: File | Blob, filename: string) {
    setBusy(true)
    setMessage('')
    try {
      const body = new FormData()
      body.append('scopeId', scopeId)
      body.append(
        'file',
        file instanceof File
          ? file
          : new File([file], filename, { type: file.type })
      )
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: await authHeaders(),
        body,
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
      }
      if (!res.ok) {
        setMessage(data.error || 'تعذّر الرفع')
        return
      }
      setMessage(data.messageAr || 'تم الحفظ')
      await refresh()
      onUploaded?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطأ في الرفع')
    } finally {
      setBusy(false)
    }
  }

  async function ingestToBrain(fileId?: string, file?: File) {
    setBusy(true)
    setMessage('جاري الاستيعاب في عقل الشركة…')
    try {
      let res: Response
      if (file) {
        const body = new FormData()
        body.append('scopeId', scopeId)
        body.append('file', file)
        body.append('titleAr', file.name)
        res = await fetch('/api/brain/ingest', {
          method: 'POST',
          headers: await authHeaders(),
          body,
        })
      } else if (fileId) {
        res = await fetch('/api/brain/ingest', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ scopeId, localFileId: fileId }),
        })
      } else {
        setMessage('اختر ملفاً للاستيعاب')
        return
      }
      const data = (await res.json()) as { error?: string; messageAr?: string }
      setMessage(data.messageAr || data.error || 'تم')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'فشل الاستيعاب')
    } finally {
      setBusy(false)
    }
  }

  async function toggleMacRecord() {
    if (recording && mediaRef.current) {
      try {
        const { blob, mimeType } = await mediaRef.current.stop()
        mediaRef.current = null
        setRecording(false)
        await uploadBlob(blob, `voice-${Date.now()}.${extForAudioMime(mimeType)}`)
      } catch (e) {
        setRecording(false)
        setMessage(e instanceof Error ? e.message : 'فشل حفظ التسجيل')
      }
      return
    }
    const support = checkBrowserRecordSupport()
    if (!support.ok) {
      setMessage(support.reasonAr || 'التسجيل غير متاح')
      return
    }
    try {
      const active = await startBrowserRecording()
      mediaRef.current = active
      setRecording(true)
      setMessage('جاري التسجيل للحفظ على الماك… اضغط مجدداً للإيقاف')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذّر الوصول للميكروفون')
    }
  }

  if (compact) {
    return (
      <div className="relative" dir="rtl">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ab-border bg-white text-ab-ink hover:bg-stone-50 disabled:opacity-40"
          aria-label="تحميل ملفات"
          title="تحميل ملفات"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute bottom-full end-0 z-20 mb-2 w-64 rounded-xl border border-ab-border bg-white p-2 shadow-lg">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1.5 text-[11px]"
              >
                <FileUp className="h-3 w-3" />
                تحميل ملفات
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-ab-accent/40 bg-ab-accent/5 px-2 py-1.5 text-[11px] text-ab-accent">
                <Brain className="h-3 w-3" />
                عقل الشركة
                <input
                  type="file"
                  accept=".pdf,application/pdf,.txt,.md,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/tiff"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void ingestToBrain(undefined, f)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleMacRecord()}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]',
                  recording
                    ? 'border-ab-warn bg-ab-warn/10 text-ab-warn'
                    : 'border-ab-border'
                )}
              >
                <Mic className="h-3 w-3" />
                {recording ? 'إيقاف' : 'حفظ صوتي'}
              </button>
            </div>
            {message && (
              <p className="mt-1.5 text-[10px] text-stone-500">{message}</p>
            )}
            {files.length > 0 && (
              <ul className="mt-1.5 max-h-20 space-y-0.5 overflow-y-auto text-[10px] text-stone-600">
                {files.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <span className="truncate">{f.originalName}</span>
                    {(f.kind === 'pdf' ||
                      f.kind === 'doc' ||
                      f.kind === 'pptx' ||
                      f.kind === 'xlsx' ||
                      f.kind === 'image') && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-ab-accent hover:underline"
                        onClick={() => void ingestToBrain(f.id)}
                      >
                        عقل
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,*/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadBlob(f, f.name)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="rounded-md border border-dashed border-ab-border bg-stone-50 p-2"
      dir="rtl"
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs disabled:opacity-40"
        >
          <FileUp className="h-3.5 w-3.5" />
          تحميل ملفات
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-ab-accent/40 bg-ab-accent/5 px-2 py-1.5 text-xs text-ab-accent">
          <Brain className="h-3.5 w-3.5" />
          إلى عقل الشركة
          <input
            type="file"
            accept=".pdf,application/pdf,.txt,.md,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/tiff"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void ingestToBrain(undefined, f)
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleMacRecord()}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40',
            recording
              ? 'border-ab-warn bg-ab-warn/10 text-ab-warn'
              : 'border-ab-border bg-white'
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          {recording ? 'إيقاف وحفظ' : 'حفظ صوتي للماك'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,*/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void uploadBlob(f, f.name)
          e.target.value = ''
        }}
      />
      {message && <p className="mt-1 text-[11px] text-stone-500">{message}</p>}
    </div>
  )
}
