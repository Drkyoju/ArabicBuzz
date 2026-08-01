'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Mic, Paperclip, Brain } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type StoredFile = {
  id: string
  kind: string
  originalName: string
  size: number
  createdAt: string
}

export function LocalUploadPanel({
  scopeId,
  onUploaded,
}: {
  scopeId: string
  onUploaded?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<StoredFile[]>([])
  const [storageRoot, setStorageRoot] = useState('')

  const refresh = useCallback(async () => {
    const headers = await authHeaders()
    const listRes = await fetch(
      `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`,
      { headers }
    )
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        files?: StoredFile[]
        storage?: { root?: string; enabled?: boolean; error?: string }
        error?: string
      }
      setFiles(data.files || [])
      setStorageRoot(data.storage?.root || '')
      if (data.error) setMessage(data.error)
    }
  }, [scopeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
        file?: StoredFile
      }
      if (!res.ok) {
        setMessage(data.error || 'تعذّر الرفع')
        return
      }
      setMessage(data.messageAr || 'تم الحفظ على الماك')
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

  async function toggleRecord() {
    if (recording && mediaRef.current) {
      mediaRef.current.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        void uploadBlob(blob, `voice-${Date.now()}.webm`)
      }
      mediaRef.current = rec
      rec.start()
      setRecording(true)
      setMessage('جاري التسجيل… اضغط مجدداً للإيقاف والحفظ على الماك')
    } catch {
      setMessage('تعذّر الوصول للميكروفون.')
    }
  }

  return (
    <div
      className="rounded-md border border-dashed border-ab-border bg-stone-50 p-2"
      dir="rtl"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-stone-600">
          تخزين الماك · عقل الشركة
        </span>
        {storageRoot && (
          <span
            className="max-w-full truncate text-[10px] text-stone-400"
            dir="ltr"
          >
            {storageRoot}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs disabled:opacity-40"
        >
          <FileUp className="h-3.5 w-3.5" />
          PDF / Word / Excel / PPT
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
          onClick={() => void toggleRecord()}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40 ${
            recording
              ? 'border-ab-warn bg-ab-warn/10 text-ab-warn'
              : 'border-ab-border bg-white'
          }`}
        >
          <Mic className="h-3.5 w-3.5" />
          {recording ? 'إيقاف وحفظ' : 'ملاحظة صوتية'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5" />
          صوت من الجهاز
          <input
            type="file"
            accept="audio/*,.ogg,.mp3,.wav,.m4a,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadBlob(f, f.name)
              e.target.value = ''
            }}
          />
        </label>
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
      {files.length > 0 && (
        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-stone-600">
          {files.slice(0, 8).map((f) => (
            <li key={f.id} className="flex justify-between gap-2">
              <span className="truncate">
                {f.kind === 'pdf'
                  ? '📄'
                  : f.kind === 'pptx'
                    ? '📊'
                    : f.kind === 'xlsx'
                      ? '📗'
                      : f.kind === 'audio'
                        ? '🎤'
                        : f.kind === 'image'
                          ? '🖼️'
                          : '📎'}{' '}
                {f.originalName}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {(f.kind === 'pdf' ||
                  f.kind === 'doc' ||
                  f.kind === 'pptx' ||
                  f.kind === 'xlsx' ||
                  f.kind === 'image') && (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-ab-accent hover:underline disabled:opacity-40"
                    onClick={() => void ingestToBrain(f.id)}
                  >
                    عقل
                  </button>
                )}
                <span className="text-stone-400">
                  {Math.round(f.size / 1024)}ك
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
