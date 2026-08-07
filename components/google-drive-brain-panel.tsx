'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Loader2, RefreshCw, Link2 } from 'lucide-react'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import {
  authHeaders,
  connectGoogleCalendar,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { GoogleSetupChecklist } from '@/components/google-setup-checklist'

const BRAIN_FOLDER_URL =
  'https://drive.google.com/drive/folders/1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'

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
  brainMode?: string
}

export function GoogleDriveBrainPanel() {
  const signedIn = useSignedIn()
  const isGuest = signedIn === false
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [autoSyncReady, setAutoSyncReady] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/drive/brain', {
        headers: await authHeaders(),
      })
      if (res.status === 401) {
        setPreview({ connected: false })
        setNote('سجّل الدخول أولاً لربط Drive ومزامنة عقل الشركة.')
        return
      }
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
    if (signedIn !== true) {
      setPreview({ connected: false })
      setBusy(false)
      return
    }
    void load()
  }, [load, signedIn])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { driveBrainOwnerConfigured?: boolean }) => {
        if (!cancelled) setAutoSyncReady(Boolean(d.driveBrainOwnerConfigured))
      })
      .catch(() => {
        if (!cancelled) setAutoSyncReady(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function sync() {
    setSyncing(true)
    setNote('مزامنة سحابية من مجلد «ملفات الجمعية» (بدون ماك)…')
    try {
      let rounds = 0
      let totalIngested = 0
      let lastMessage = ''
      let batchSize = 2
      let timeouts = 0
      // Auto-continue batches until folder is fully indexed (cap rounds)
      while (rounds < 20) {
        rounds += 1
        const res = await fetch('/api/google/drive/brain', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ maxFiles: batchSize }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          messageAr?: string
          ingested?: number
          scanned?: number
          hasMore?: boolean
          remaining?: number
          alreadyIndexed?: number
        }
        if (!res.ok) {
          // Gateway timeout: shrink batch and retry instead of aborting the whole sync.
          if (res.status === 504 || res.status === 502) {
            timeouts += 1
            batchSize = 1
            setNote(
              `انتهت مهلة الجولة ${rounds} — نكمل بملف واحد في كل جولة…`
            )
            if (timeouts >= 6) {
              throw new Error(
                'المزامنة بطيئة جداً على الاستضافة. أعد المحاولة لاحقاً أو زامن على دفعات.'
              )
            }
            continue
          }
          throw new Error(data.error || 'فشلت المزامنة')
        }
        timeouts = 0
        totalIngested += data.ingested || 0
        lastMessage = data.messageAr || ''
        setNote(
          `${lastMessage}${data.hasMore ? ` (جولة ${rounds}…)` : ''}`
        )
        if (!data.hasMore) break
      }
      setNote(
        lastMessage ||
          `اكتملت المزامنة السحابية · ${totalIngested} ملف في هذه الجلسة`
      )
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشلت المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  const folderUrl = preview?.folderUrl || BRAIN_FOLDER_URL

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FolderOpen className="h-4 w-4 text-ab-accent" aria-hidden />
            عقل الشركة — مجلد Drive (سحابي)
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            المصدر الوحيد لـ Gemini هو مجلد{' '}
            <strong>ملفات الجمعية</strong> على Google Drive — فهرسة في السحابة
            بدون ماك. سجّل الدخول، اربط Google، ثم زامن.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
            الأفضل مجاناً لتحويل الملفات: بعد الربط يستخدم الشات Google Drive
            (استيراد/تصدير) لجودة عالية دون دفع — لا يلزم CloudConvert.
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

      <p className="mb-2 text-[11px]">
        <a
          href={folderUrl}
          target="_blank"
          rel="noreferrer"
          className="text-ab-accent underline"
          dir="ltr"
        >
          {folderUrl.replace('?usp=sharing', '')}
        </a>
        {typeof preview?.count === 'number' ? (
          <span className="ms-2 text-stone-500">· {preview.count} ملف في Drive</span>
        ) : null}
      </p>

      {!preview?.connected && !isGuest && (
        <div className="mb-3 rounded-xl border border-ab-accent/30 bg-gradient-to-bl from-ab-accent/10 to-white px-3 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-ab-ink">
            <Link2 className="h-4 w-4 text-ab-accent" aria-hidden />
            Drive غير مربوط — اضغط الزر مرة واحدة
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            بدون الربط: لا فهرسة لعقل الشركة ولا تحويل PDF→Word النظيف عبر Google.
            اختر حساباً يرى مجلد «ملفات الجمعية» ثم وافق على الصلاحيات.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pe-4 text-[11px] leading-relaxed text-stone-600">
            <li>اضغط «١) ربط Google (Drive)» أدناه</li>
            <li>وافق على Drive / التقويم / Gmail حسب الشاشة</li>
            <li>ارجع هنا واضغط «٢) أعد المزامنة» لفهرسة المجلد</li>
          </ol>
          <p className="mt-2 text-[10px] leading-snug text-stone-500">
            إن ظهرت «تطبيق غير موثّق»: Advanced → Continue، أو اطلب من المالك
            Publish في Google Console (القائمة أدناه).
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {isGuest ? (
          <Link
            href="/auth/login"
            className="ab-btn-primary inline-flex items-center gap-1.5 !px-3 !py-2 text-xs"
          >
            سجّل الدخول لربط Drive
          </Link>
        ) : !preview?.connected ? (
          <button
            type="button"
            onClick={() => {
              if (!isSupabaseConfigured()) {
                setNote('Supabase غير مُعدّ')
                return
              }
              setNote('جاري فتح موافقة Google — أكمل من النافذة ثم ارجع…')
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
            className="ab-btn-primary inline-flex items-center gap-1.5 !px-4 !py-2.5 text-sm shadow-sm"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            ١) ربط Google (Drive) — اضغط هنا
          </button>
        ) : (
          <>
            <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-900">
              متصل{preview.email ? ` · ${preview.email}` : ''} — تحويل PDF→Word
              جاهز
            </span>
            <button
              type="button"
              onClick={() => void sync()}
              disabled={syncing}
              className="ab-btn-accent-soft inline-flex !px-3 !py-1.5 text-xs disabled:opacity-40"
              title="أعد فهرسة ملفات Drive إلى عقل المعرفة (بحث عربي)"
            >
              {syncing
                ? 'جاري الفهرسة السحابية…'
                : '٢) أعد المزامنة · فهرسة Drive'}
            </button>
          </>
        )}
      </div>

      {!preview?.connected && !isGuest ? (
        <GoogleSetupChecklist
          className="mb-3 rounded-lg border border-ab-border/80 bg-white/80 px-3 py-2"
          focus="drive"
          defaultOpen
        />
      ) : null}

      {note && (
        <p className="mb-2 text-[11px] leading-snug text-stone-600">{note}</p>
      )}

      {!preview?.connected && !isGuest && (
        <p className="mb-3 text-[11px] leading-snug text-stone-500">
          بدون هذا الربط يبقى التحويل الاحتياطي أضعف. استخدم حساب Google الذي
          يملك وصولاً للمجلد أعلاه، ثم زامن لفهرسة الوثائق.
        </p>
      )}
      {preview?.connected && (preview.count || 0) > 0 && (
        <p className="mb-3 text-[11px] leading-snug text-stone-500">
          إن لم يظهر مستند في البحث: اضغط «أعد المزامنة · فهرسة Drive» بعد رفع
          ملفات جديدة إلى المجلد.
        </p>
      )}

      {preview?.connected && autoSyncReady === false && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
          المزامنة اليدوية تعمل بحسابك. المزامنة التلقائية الليلية غير مفعّلة —
          يحتاج المسؤول ضبط حساب مالك للمزامنة في الاستضافة.
        </p>
      )}

      {preview?.connected && (preview.count === 0 || !preview.files?.length) && (
        <div className="mb-3 rounded-xl border border-dashed border-ab-border bg-gradient-to-bl from-stone-50 to-emerald-50/40 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            لم تظهر ملفات — تحقق من صلاحية المجلد
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-stone-500">
            افتح الرابط وتأكد أن الحساب المربوط يرى الملفات، ثم زامن مرة أخرى.
          </p>
          <a
            href={folderUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-md border border-ab-border bg-white px-3 py-1.5 text-[11px] font-medium text-ab-accent"
          >
            فتح ملفات الجمعية
          </a>
        </div>
      )}

      {preview?.files && preview.files.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-ab-border bg-stone-50 p-2 text-[11px]">
          {preview.files.slice(0, 30).map((f) => (
            <li key={f.id} className="truncate text-stone-700">
              {f.name}
              <span className="text-stone-400">
                {' '}
                · {f.mimeType.split('.').pop()}
              </span>
            </li>
          ))}
          {preview.files.length > 30 && (
            <li className="text-stone-400">
              …و{preview.files.length - 30} أخرى
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
