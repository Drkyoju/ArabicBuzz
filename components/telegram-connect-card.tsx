'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, CheckCircle2, Circle } from 'lucide-react'
import { DevDisclosure } from '@/components/dev-disclosure'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { CommitteeTelegramPanel } from '@/components/committee-telegram-panel'

/**
 * User-facing Telegram status — deep-link bind via ?start=scope_<id>.
 */
export function TelegramConnectCard() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [ready, setReady] = useState<boolean | null>(null)
  const [ownerOk, setOwnerOk] = useState(false)
  const [outboundOk, setOutboundOk] = useState(false)
  const botBase =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
    'https://t.me/alhuda14bot'
  const deepLink = `${botBase.replace(/\/$/, '')}?start=scope_${encodeURIComponent(scopeId)}`

  useEffect(() => {
    let cancelled = false
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then(
        (d: {
          telegramConfigured?: boolean
          telegramOwnerConfigured?: boolean
          telegramOutboundReady?: boolean
        }) => {
          if (cancelled) return
          setReady(Boolean(d.telegramConfigured))
          setOwnerOk(Boolean(d.telegramOwnerConfigured))
          setOutboundOk(Boolean(d.telegramOutboundReady))
        }
      )
      .catch(() => {
        if (!cancelled) setReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ok = ready === true

  return (
    <div className="rounded-xl border border-ab-border bg-ab-surface p-4" dir="rtl">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ab-ink">
        <MessageCircle className="h-4 w-4 text-ab-accent" aria-hidden />
        تيليجرام · أوامر من الجوال
      </h3>
      <p className="mb-3 text-xs text-stone-500">
        بوت واحد فقط (@alhuda14bot) — محادثة خاصة للتنبيهات أو مجموعة الجمعية.
        لا حاجة لبوت ثانٍ.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        {ready === null ? (
          <span className="text-stone-400">جاري الفحص…</span>
        ) : ok && (outboundOk || ownerOk) ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            مربوط
            {outboundOk ? ' · الإرسال يعمل تلقائياً' : ' · المالك مربوط'}
          </span>
        ) : ok ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            البوت جاهز · اضغط الرابط مرة واحدة لربط محادثتك
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-900">
            <Circle className="h-3.5 w-3.5" />
            غير مفعّل بعد — يضبطه المسؤول على الاستضافة
          </span>
        )}
      </div>
      <ol className="mb-3 list-decimal space-y-1 pe-4 text-xs text-stone-600">
        <li>
          خاص (تنبيهاتك): «ربط هذه المساحة» ثم{' '}
          <code dir="ltr">/start</code>.
        </li>
        <li>
          مجموعة: أضف البوت كمشرف (رسائل + وسائط) → من داخل المجموعة أرسل{' '}
          <code dir="ltr">/link@alhuda14bot scope_{scopeId}</code> — مرة واحدة
          فقط للربط.
        </li>
        <li>
          بعد الربط اكتب بالعربية العادية — بدون{' '}
          <code dir="ltr">/ask</code>. الصوت والملفات مدعومان.
        </li>
        <li>
          ضروري: BotFather → Group Privacy →{' '}
          <strong className="font-semibold">Disable</strong> ليرى كل الرسائل.
          إن بقيت الخصوصية مفعّلة: منشن البوت أو رد على رسالته.
        </li>
      </ol>
      {botBase.includes('t.me/') && (
        <div className="flex flex-wrap gap-2">
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            ربط هذه المساحة
          </a>
          <a
            href={botBase}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs font-medium text-ab-ink"
          >
            فتح البوت فقط
          </a>
        </div>
      )}
    </div>
  )
}

/** Optional services — short user copy; devops details stay collapsed. */
export function ConnectedServicesPanel() {
  const [zoomOk, setZoomOk] = useState(false)
  const [macOnline, setMacOnline] = useState(false)
  const [macConfigured, setMacConfigured] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeaders()
        const [z, m] = await Promise.all([
          fetch('/api/integrations/status').then((r) => r.json()),
          fetch('/api/mac/status', { headers }).then((r) => r.json()).catch(() => null),
        ])
        setZoomOk(Boolean(z?.zoomConfigured))
        setMacConfigured(Boolean(m?.configured || z?.macSyncConfigured))
        setMacOnline(Boolean(m?.online))
      } catch {
        /* ignore */
      }
    })()
  }, [])

  return (
    <div className="space-y-3" dir="rtl">
      <TelegramConnectCard />
      <CommitteeTelegramPanel />
      <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-xs text-stone-600">
        <p className="mb-1 font-semibold text-ab-ink">
          اجتماعات Zoom{' '}
          <span className="font-normal text-stone-400">
            {zoomOk ? '· جاهز تلقائياً' : '· اختياري'}
          </span>
        </p>
        <p>
          {zoomOk
            ? 'عند حجز موعد من التقويم يُنشأ رابط Zoom تلقائياً إن تركت الحقل فارغاً. يمكنك أيضاً لصق رابط يدوي.'
            : 'يمكنك لصق رابط اجتماع يدوياً عند الحجز. الإنشاء التلقائي يفعّله المسؤول مرة واحدة.'}
        </p>
      </div>
      <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-xs text-stone-600">
        <p className="mb-1 font-semibold text-ab-ink">
          خزنة الماك{' '}
          <span className="font-normal text-stone-400">
            {macOnline
              ? '· متصلة'
              : macConfigured
                ? '· مضبوطة · غير متصلة الآن'
                : '· اختياري'}
          </span>
        </p>
        <p>
          لتخزين الملفات الكبيرة على جهازك. من قسم «ملفات» بعد تفعيل المسؤول
          للنفق.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 p-4 text-xs text-stone-600">
        <p className="mb-1 font-semibold text-ab-ink">تفريغ الصوت</p>
        <p>
          الميكروفون في الغرفة يجرّب المزوّدين بالترتيب حتى ينجح أحدهم — لا حاجة
          لاختيار شيء.
        </p>
        <DevDisclosure
          className="mt-2 group"
          summaryAr="ترتيب مزوّدي التفريغ"
        >
          Willow إن وُجد → Gemini → Hugging Face عربية → Groq (النسخ الاحتياطية اختيارية)
          Whisper → Deepgram اختياري.
        </DevDisclosure>
      </div>
    </div>
  )
}
