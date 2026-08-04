'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Radio } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type ZoomHint = { configured: boolean }

/**
 * Compact checklist: Telegram / Zoom / Mac — what Netlify needs.
 */
export function IntegrationsSetupPanel() {
  const [zoom, setZoom] = useState<ZoomHint | null>(null)
  const [macOnline, setMacOnline] = useState<boolean | null>(null)
  const [macConfigured, setMacConfigured] = useState<boolean | null>(null)
  const [tg, setTg] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeaders()
        const [z, m] = await Promise.all([
          fetch('/api/integrations/status').then((r) => r.json()).catch(() => null),
          fetch('/api/mac/status', { headers }).then((r) => r.json()).catch(() => null),
        ])
        if (z) {
          setZoom({ configured: Boolean(z.zoomConfigured) })
          setTg(Boolean(z.telegramConfigured))
        } else {
          setZoom({ configured: false })
        }
        setMacConfigured(Boolean(m?.configured))
        setMacOnline(Boolean(m?.online))
      } catch {
        setZoom({ configured: false })
      }
    })()
  }, [])

  return (
    <div dir="rtl" className="space-y-3 text-xs leading-relaxed text-stone-600">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ab-ink">
        <Radio className="h-4 w-4 text-ab-accent" aria-hidden />
        تكاملات اختيارية (Telegram · Zoom · الماك)
      </h3>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          Zoom إنشاء تلقائي{' '}
          <span className="font-normal text-stone-400">
            {zoom?.configured ? '· مضبوط' : '· غير مضبوط'}
          </span>
        </p>
        <ol className="list-decimal space-y-1 pe-4">
          <li>
            افتح{' '}
            <a
              href="https://marketplace.zoom.us/develop/create"
              target="_blank"
              rel="noreferrer"
              className="text-ab-accent underline"
            >
              Zoom Marketplace → Build App
            </a>
          </li>
          <li>اختر Server-to-Server OAuth → Create</li>
          <li>
            Scopes: <code dir="ltr">meeting:write:meeting</code> و{' '}
            <code dir="ltr">user:read:user</code> (أو meeting:write)
          </li>
          <li>Activate the app</li>
          <li>
            انسخ إلى Netlify:{' '}
            <code dir="ltr">ZOOM_ACCOUNT_ID</code> ·{' '}
            <code dir="ltr">ZOOM_CLIENT_ID</code> ·{' '}
            <code dir="ltr">ZOOM_CLIENT_SECRET</code> ثم Redeploy
          </li>
        </ol>
        <p className="mt-1 text-[11px] text-stone-500">
          اختياري — يمكنك لصق رابط Zoom يدوياً عند الحجز بدون هذا الإعداد.
        </p>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ab-ink">
          <MessageCircle className="h-3.5 w-3.5" />
          Telegram{' '}
          <span className="font-normal text-stone-400">
            {tg ? '· مضبوط' : '· غير مضبوط'}
          </span>
        </p>
        <ol className="list-decimal space-y-1 pe-4">
          <li>
            أنشئ بوت عبر{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="text-ab-accent underline"
            >
              @BotFather
            </a>{' '}
            وانسخ التوكن
          </li>
          <li>
            Netlify: <code dir="ltr">TELEGRAM_BOT_TOKEN</code>
          </li>
          <li>
            مالك القناة: أرسل <code dir="ltr">/start</code> للبوت — سيرد
            بمعرّف المحادثة. أو اضبط{' '}
            <code dir="ltr">TELEGRAM_OWNER_CHAT_ID</code> على Netlify
          </li>
          <li>
            أدوات المالك (تقويم/Drive):{' '}
            <code dir="ltr">CHANNEL_OWNER_USER_ID</code> = معرّف مستخدم Supabase
            بعد ربط Google
          </li>
          <li>
            اختياري للاختبار: <code dir="ltr">TELEGRAM_TEST_CHAT_ID</code>
          </li>
          <li>
            Webhook:{' '}
            <code dir="ltr" className="break-all text-[10px]">
              https://arabicbuzz.netlify.app/api/webhooks/telegram
            </code>
          </li>
          <li>
            من الهاتف: أرسل نصاً أو صوتاً · أوامر{' '}
            <code dir="ltr">/help</code> · <code dir="ltr">/rooms</code> ·{' '}
            <code dir="ltr">/approve</code>
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          خزنة الماك{' '}
          <span className="font-normal text-stone-400">
            {macConfigured === false
              ? '· غير مضبوطة'
              : macOnline
                ? '· متصلة'
                : '· مضبوطة · غير متصلة'}
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          لا يمكن تفعيلها من السحابة وحدها — تحتاج جهازك يعمل كوكيل + نفق عام.
        </p>
        <ol className="list-decimal space-y-1 pe-4">
          <li>
            على الماك: <code dir="ltr">npm run storage:setup</code> (يشغّل الوكيل
            ويطبع السر)
          </li>
          <li>
            نفق: <code dir="ltr">npx ngrok http 7420</code> → انسخ الرابط
            https
          </li>
          <li>
            Netlify: <code dir="ltr">MAC_SYNC_URL</code>=رابط ngrok · نفس{' '}
            <code dir="ltr">MAC_SYNC_SECRET</code> ·{' '}
            <code dir="ltr">BRAIN_PRIMARY=mac</code> ·{' '}
            <code dir="ltr">NEXT_PUBLIC_MAC_UPLOAD_URL</code>=نفس الرابط
          </li>
          <li>Redeploy ثم اضغط «فحص» في لوحة خزنة الماك</li>
        </ol>
      </div>
    </div>
  )
}
