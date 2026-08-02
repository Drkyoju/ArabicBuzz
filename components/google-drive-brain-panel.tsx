'use client'

import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
}

type Preview = {
  connected?: boolean
  folderId?: string
  folderUrl?: string
  count?: number
  files?: DriveFile[]
  error?: string
  email?: string | null
}

export function GoogleDriveBrainPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/drive/brain', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as Preview
      setPreview(data)
      if (data.error) setNote(data.error)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل التحميل')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sync() {
    setSyncing(true)
    setNote('جاري مزامنة مجلد Drive إلى عقل الشركة…')
    try {
      const res = await fetch('/api/google/drive/brain', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, maxFiles: 40 }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        ingested?: number
        scanned?: number
      }
      if (!res.ok) throw new Error(data.error || 'فشلت المزامنة')
      setNote(data.messageAr || `تمت مزامنة ${data.ingested}/${data.scanned}`)
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشلت المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FolderOpen className="h-4 w-4 text-ab-accent" aria-hidden />
            عقل الشركة من Google Drive
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            مجلد «ملفات الجمعية» يصبح مصدر المعرفة: يُستخرج النص ويُفهرس للبحث
            في الدردشة (ومع{' '}
            <code dir="ltr">BRAIN_PRIMARY=mac</code> يُحفظ الفهرس على الماك).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          تحديث
        </button>
      </div>

      {preview?.folderUrl && (
        <p className="mb-2 text-[11px]">
          <a
            href={preview.folderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ab-accent underline"
            dir="ltr"
          >
            فتح المجلد في Drive
          </a>
          {typeof preview.count === 'number' ? (
            <span className="mr-2 text-stone-500">
              · {preview.count} ملف
            </span>
          ) : null}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {!preview?.connected ? (
          <button
            type="button"
            onClick={() => {
              if (!isSupabaseConfigured()) {
                setNote('Supabase غير مُعدّ')
                return
              }
              setNote('جاري فتح تسجيل Google…')
              void connectGoogleCalendar().catch((e) => {
                const msg =
                  e instanceof Error ? e.message : 'تعذّر بدء ربط Google'
                setNote(
                  /provider is not enabled|Unsupported provider/i.test(msg)
                    ? 'مزوّد Google غير مفعّل في Supabase — فعّل Google وأضف Client ID/Secret ثم أعد المحاولة.'
                    : msg
                )
              })
            }}
            className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
          >
            ربط Google (Drive + تقويم)
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing}
            className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {syncing ? 'جاري المزامنة…' : 'مزامنة المجلد → عقل الشركة'}
          </button>
        )}
      </div>

      {note && (
        <p className="mb-2 text-[11px] leading-snug text-stone-600">{note}</p>
      )}

      {!preview?.connected && (
        <p className="mb-3 text-[11px] leading-snug text-stone-500">
          غير مربوط — من قسم التقويم أو الزر أعلاه اربط Google، أو راجع خطوات
          الإعداد في الإعدادات.
        </p>
      )}

      {preview?.files && preview.files.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-ab-border bg-stone-50 p-2 text-[11px]">
          {preview.files.slice(0, 30).map((f) => (
            <li key={f.id} className="truncate text-stone-700">
              {f.name}
              <span className="text-stone-400"> · {f.mimeType.split('.').pop()}</span>
            </li>
          ))}
          {preview.files.length > 30 && (
            <li className="text-stone-400">…و{preview.files.length - 30} أخرى</li>
          )}
        </ul>
      )}
    </div>
  )
}
