'use client'

import { useCallback, useEffect, useState } from 'react'
import { HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type MacStatus = {
  configured?: boolean
  primaryMac?: boolean
  online?: boolean
  error?: string | null
  messageAr?: string
  publicUploadUrl?: string | null
  brain?: {
    vaultRoot?: string
    chunkCount?: number
    vaultBytes?: number
    vaultFiles?: number
    messageAr?: string
  } | null
  directUpload?: {
    uploadUrl: string
    maxBytes: number
  } | null
}

function fmtBytes(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function MacBrainPanel() {
  const [status, setStatus] = useState<MacStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/mac/status', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as MacStatus
      setStatus(data)
    } catch (e) {
      setStatus({
        configured: false,
        online: false,
        messageAr: e instanceof Error ? e.message : 'تعذّر الفحص',
      })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <HardDrive className="h-4 w-4 text-ab-accent" aria-hidden />
            خزنة الماك · عقل الشركة المحلي
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            خزنة الماك تعمل كسحابة مجانية للفريق: رفع، تنزيل، إعادة تسمية،
            استبدال، وحذف من الموقع. الملفات وعقل الشركة على جهازك — الماك يجب
            أن يبقى متصلاً مع النفق.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pe-4 text-[11px] text-stone-600">
            <li>
              شغّل على الماك:{' '}
              <code dir="ltr" className="rounded bg-stone-100 px-1 font-mono text-[10px]">
                npm run storage:sync
              </code>
            </li>
            <li>افتح نفقاً (ngrok) واضبط MAC_SYNC_URL و MAC_SYNC_SECRET على Netlify.</li>
            <li>
              للمعرفة الحساسة عيّن{' '}
              <code dir="ltr" className="rounded bg-stone-100 px-1 font-mono text-[10px]">
                BRAIN_PRIMARY=mac
              </code>
            </li>
          </ol>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          فحص
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
        <span
          className={
            !status?.configured
              ? 'rounded-md border border-ab-border bg-stone-50 px-2 py-1 text-stone-600'
              : status.online
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800'
                : 'rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900'
          }
        >
          {!status?.configured
            ? 'غير مضبوط — شغّل npm run storage:setup + نفق'
            : status.online
              ? 'الوكيل متصل'
              : 'مضبوط · غير متصل'}
        </span>
        <span className="rounded-md border border-ab-border bg-white px-2 py-1 text-stone-600">
          {status?.primaryMac
            ? 'BRAIN_PRIMARY=mac'
            : 'البحث السحابي (فعّل BRAIN_PRIMARY=mac)'}
        </span>
      </div>

      {status?.messageAr && (
        <p className="mb-2 text-[11px] text-stone-600">{status.messageAr}</p>
      )}

      {status?.brain && (
        <ul className="mb-3 space-y-1 rounded-md border border-ab-border bg-stone-50 px-2.5 py-2 text-[11px] text-stone-700">
          <li>
            المسار:{' '}
            <code dir="ltr" className="text-[10px]">
              {status.brain.vaultRoot || '~/ArabicBuzz/data'}
            </code>
          </li>
          <li>مقاطع العقل: {status.brain.chunkCount ?? 0}</li>
          <li>
            حجم الخزنة: {fmtBytes(status.brain.vaultBytes)} · ملفات:{' '}
            {status.brain.vaultFiles ?? 0}
          </li>
          {status.directUpload && (
            <li>
              حد الرفع المباشر:{' '}
              {fmtBytes(status.directUpload.maxBytes)}
            </li>
          )}
        </ul>
      )}

      <ol className="list-decimal space-y-1 pr-4 text-[11px] leading-relaxed text-stone-600">
        <li>
          على الماك: <code dir="ltr">npm run storage:sync</code>
        </li>
        <li>
          نفق عام: <code dir="ltr">npx ngrok http 7420</code>
        </li>
        <li>
          Netlify: <code dir="ltr">MAC_SYNC_URL</code> و{' '}
          <code dir="ltr">MAC_SYNC_SECRET</code> و{' '}
          <code dir="ltr">BRAIN_PRIMARY=mac</code> و{' '}
          <code dir="ltr">NEXT_PUBLIC_MAC_UPLOAD_URL</code>
        </li>
      </ol>
    </div>
  )
}
