'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, CheckCircle2, Circle } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

/**
 * User-facing Telegram status — no env-var dump.
 */
export function TelegramConnectCard() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [ownerOk, setOwnerOk] = useState(false)
  const botUrl =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
    'https://t.me/alhuda14bot'

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
          setReady(Boolean(d.telegramOutboundReady || d.telegramConfigured))
          setOwnerOk(Boolean(d.telegramOwnerConfigured))
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
        راسل البوت من هاتفك لإرسال المهام والموافقة على الإجراءات.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        {ready === null ? (
          <span className="text-stone-400">جاري الفحص…</span>
        ) : ok ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            البوت جاهز
            {ownerOk ? ' · المالك مربوط' : ' · أرسل /start لربط محادثتك'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-900">
            <Circle className="h-3.5 w-3.5" />
            غير مفعّل بعد — يحتاج إعداد البوت من المسؤول
          </span>
        )}
      </div>
      <ol className="mb-3 list-decimal space-y-1 pe-4 text-xs text-stone-600">
        <li>افتح البوت في تيليجرام (من الرابط الذي يعطيك إياه المسؤول).</li>
        <li>
          أرسل <code dir="ltr">/start</code> ثم جرّب <code dir="ltr">/help</code>
        </li>
        <li>
          للموافقات المعلّقة: <code dir="ltr">/approve</code>
        </li>
      </ol>
      {botUrl.includes('t.me/') && botUrl.length > 'https://t.me/'.length && (
        <a
          href={botUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          فتح البوت في تيليجرام
        </a>
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
      <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-xs text-stone-600">
        <p className="mb-1 font-semibold text-ab-ink">
          Zoom{' '}
          <span className="font-normal text-stone-400">
            {zoomOk ? '· جاهز للإنشاء التلقائي' : '· اختياري'}
          </span>
        </p>
        <p>
          يمكنك لصق رابط اجتماع يدوياً عند الحجز. الإنشاء التلقائي يحتاج إعداد
          المسؤول مرة واحدة.
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
    </div>
  )
}
