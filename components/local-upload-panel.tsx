'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Mic, Paperclip } from 'lucide-react'
import { getAccessToken } from '@/lib/supabase/browser'

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
    const token = await getAccessToken()
    if (!token) return
    const res = await fetch(
      `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}&status=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    // list endpoint is same route GET
    const listRes = await fetch(
      `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
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
    void res
  }, [scopeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function uploadBlob(file: File | Blob, filename: string) {
    const token = await getAccessToken()
    if (!token) {
      setMessage('يلزم تسجيل الدخول لرفع الملفات.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const body = new FormData()
      body.append('scopeId', scopeId)
      body.append(
        'file',
        file instanceof File ? file : new File([file], filename, { type: file.type })
      )
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
    <div className="rounded-md border border-dashed border-ab-border bg-stone-50 p-2" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-stone-600">
          تخزين الماك المحلي
        </span>
        {storageRoot && (
          <span className="max-w-full truncate text-[10px] text-stone-400" dir="ltr">
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
          PDF / ملف
        </button>
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
        accept=".pdf,application/pdf,image/*,.doc,.docx,.txt,.md"
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
                {f.kind === 'pdf' ? '📄' : f.kind === 'audio' ? '🎤' : '📎'}{' '}
                {f.originalName}
              </span>
              <span className="shrink-0 text-stone-400">
                {Math.round(f.size / 1024)}ك
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
