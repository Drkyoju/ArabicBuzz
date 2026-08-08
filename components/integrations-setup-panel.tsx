'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Radio } from 'lucide-react'
import { DevDisclosure } from '@/components/dev-disclosure'
import { authHeaders } from '@/lib/supabase/browser'

type ZoomHint = { configured: boolean }

/**
 * Compact checklist: Telegram / Zoom / Mac / free WhatsApp bridge.
 */
export function IntegrationsSetupPanel() {
  const [zoom, setZoom] = useState<ZoomHint | null>(null)
  const [macOnline, setMacOnline] = useState<boolean | null>(null)
  const [macConfigured, setMacConfigured] = useState<boolean | null>(null)
  const [cuaOnline, setCuaOnline] = useState<boolean | null>(null)
  const [cuaConfigured, setCuaConfigured] = useState<boolean | null>(null)
  const [cuaStatusAr, setCuaStatusAr] = useState<string | null>(null)
  const [cloudConvertConfigured, setCloudConvertConfigured] = useState<
    boolean | null
  >(null)
  const [cloudConvertStatusAr, setCloudConvertStatusAr] = useState<string | null>(
    null
  )
  const [libreOfficeConfigured, setLibreOfficeConfigured] = useState<
    boolean | null
  >(null)
  const [libreOfficeStatusAr, setLibreOfficeStatusAr] = useState<string | null>(
    null
  )
  const [googleConvertHintAr, setGoogleConvertHintAr] = useState<string | null>(
    null
  )
  const [tg, setTg] = useState<boolean | null>(null)
  const [waStatusAr, setWaStatusAr] = useState<string | null>(null)
  const [waBridge, setWaBridge] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeaders()
        const [z, m, c] = await Promise.all([
          fetch('/api/integrations/status').then((r) => r.json()).catch(() => null),
          fetch('/api/mac/status', { headers }).then((r) => r.json()).catch(() => null),
          fetch('/api/cua/status', { headers }).then((r) => r.json()).catch(() => null),
        ])
        if (z) {
          setZoom({ configured: Boolean(z.zoomConfigured) })
          setTg(Boolean(z.telegramConfigured))
          setWaStatusAr(
            typeof z.whatsappStatusAr === 'string' ? z.whatsappStatusAr : null
          )
          setWaBridge(Boolean(z.whatsappBridgeConfigured))
          setCloudConvertConfigured(Boolean(z.cloudConvertConfigured))
          setCloudConvertStatusAr(
            typeof z.cloudConvertStatusAr === 'string'
              ? z.cloudConvertStatusAr
              : null
          )
          setLibreOfficeConfigured(Boolean(z.libreOfficeConfigured))
          setLibreOfficeStatusAr(
            typeof z.libreOfficeStatusAr === 'string'
              ? z.libreOfficeStatusAr
              : null
          )
          setGoogleConvertHintAr(
            typeof z.googleDriveConvertBestFreeAr === 'string'
              ? z.googleDriveConvertBestFreeAr
              : typeof z.googleDriveConvertHintAr === 'string'
                ? z.googleDriveConvertHintAr
                : null
          )
          if (!c) {
            setCuaConfigured(Boolean(z.cuaBridgeConfigured))
            setCuaOnline(Boolean(z.cuaBridgeOnline))
            setCuaStatusAr(
              typeof z.cuaStatusAr === 'string' ? z.cuaStatusAr : null
            )
          }
        } else {
          setZoom({ configured: false })
        }
        setMacConfigured(Boolean(m?.configured))
        setMacOnline(Boolean(m?.online))
        if (c) {
          setCuaConfigured(Boolean(c.configured))
          setCuaOnline(Boolean(c.online))
          setCuaStatusAr(
            typeof c.statusAr === 'string'
              ? c.statusAr
              : c.online
                ? 'متصل'
                : 'غير متصل'
          )
        }
      } catch {
        setZoom({ configured: false })
      }
    })()
  }, [])

  return (
    <div dir="rtl" className="space-y-3 text-xs leading-relaxed text-stone-600">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ab-ink">
        <Radio className="h-4 w-4 text-ab-accent" aria-hidden />
        تكاملات اختيارية (Telegram · واتساب · Zoom · الماك · Cua · تحويل الملفات)
      </h3>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          تحويل الملفات{' '}
          <span className="font-normal text-ab-muted-soft">
            · مجاني: Google Drive + LibreOffice
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          {googleConvertHintAr ||
            'الأفضل مجاناً: اربط Google من تبويب «عقل الشركة / Drive» لتحويل PDF وWord وExcel وPowerPoint بجودة عالية دون دفع.'}
        </p>
        <ol className="mb-2 list-decimal space-y-1 pe-4 text-[11px]">
          <li>
            من الإعدادات → عقل الشركة: اضغط{' '}
            <strong>«١) ربط Google (Drive)»</strong> مرة واحدة (مطلوب لمسار Drive)
          </li>
          <li>
            بعدها تحويل PDF→Word في الشات يستخدم Drive مجاناً بجودة عالية
          </li>
          <li>
            LibreOffice على الخادم (مجاني) يكمّل Word↔PDF دون مفتاح مدفوع
          </li>
          <li>
            التعديل الموضعي لـ Word/Excel/PPT يعمل دائماً مجاناً بدون تحويل
          </li>
          <li>CloudConvert أدناه اختياري مدفوع كاحتياطي فقط — لا يُشترى تلقائياً</li>
        </ol>
        <p className="mb-1 text-[11px] text-stone-500">
          إن لم تضغط «ربط Google» فلن يعمل مسار Drive — هذا زر موافقة في حسابك
          وليس إعداداً آلياً من الاستضافة.
        </p>
        <p className="text-[11px] text-stone-500">
          دليل:{' '}
          <span dir="ltr" className="font-mono">
            docs/file-edit-engines.md
          </span>
        </p>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          LibreOffice{' '}
          <span className="font-normal text-ab-muted-soft">
            ·{' '}
            {libreOfficeStatusAr ||
              (libreOfficeConfigured
                ? 'مجاني · مفعّل'
                : 'اختياري — INSTALL_LIBREOFFICE=1 عند البناء · أو اربط Google')}
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          محرّك مجاني/مفتوح المصدر على حاوية CranL لـ Word↔PDF وصيغ Office
          الشائعة. لا يحتاج مفتاح API. الأفضل مع Drive للعربية والملفات الممسوحة.
        </p>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          Zoom إنشاء تلقائي{' '}
          <span className="font-normal text-ab-muted-soft">
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
          <span className="font-normal text-ab-muted-soft">
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
            خاص: أرسل <code dir="ltr">/start</code> — يرد بمعرّف المحادثة. أو
            اضبط <code dir="ltr">TELEGRAM_OWNER_CHAT_ID</code>
          </li>
          <li>
            مجموعة: أضف البوت كمشرف → أرسل{' '}
            <code dir="ltr">/link</code> أو <code dir="ltr">/start</code> داخل
            المجموعة لالتقاط المعرّف السالب وربط الغرفة
          </li>
          <li>
            Group Privacy (BotFather): عطّله إن أردت ردّاً على كل الرسائل؛ وإلا
            استخدم <code dir="ltr">/ask</code> أو منشن البوت
          </li>
          <li>
            أدوات المالك: <code dir="ltr">CHANNEL_OWNER_USER_ID</code>
          </li>
          <li>
            Webhook:{' '}
            <code dir="ltr" className="break-all text-[10px]">
              https://arabicbuzz-fooc9h.cranl.net/api/webhooks/telegram
            </code>
          </li>
          <li>
            أوامر: <code dir="ltr">/help</code> · <code dir="ltr">/link</code> ·{' '}
            <code dir="ltr">/ask</code> · <code dir="ltr">/status</code>
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ab-ink">
          <MessageCircle className="h-3.5 w-3.5" />
          واتساب (مجاني فقط){' '}
          <span className="font-normal text-ab-muted-soft">
            {waBridge ? '· جسر مضبوط' : '· يحتاج جسراً محلياً'}
          </span>
        </p>
        <p className="mb-2 text-[11px] text-amber-900/90">
          {waStatusAr ||
            'لا يعمل على CranL وحده — جلسة واتساب ويب تحتاج عملية دائمة (VPS أو جهازك).'}
        </p>
        <p className="mb-1 text-[11px]">
          المسار المجاني الموصى به: Evolution API (مفتوح المصدر / Baileys) على
          جهازك أو VPS → يرسل الأحداث إلى Arabic Buzz. بدون فوترة Meta Cloud أو
          Twilio.
        </p>
        <DevDisclosure summaryAr="خطوات الجسر المجاني (مسؤول تقني)">
          <ol className="list-decimal space-y-1 pe-4">
            <li>
              شغّل Evolution API (Docker) أو عامل Baileys على جهاز دائم التشغيل
            </li>
            <li>اربط الرقم بمسح QR مرة واحدة — احفظ الجلسة على قرص/قاعدة</li>
            <li>
              وجّه Webhook الجسر إلى{' '}
              <code dir="ltr" className="break-all text-[10px]">
                https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp
              </code>
            </li>
            <li>
              CranL env:{' '}
              <code dir="ltr">WHATSAPP_BRIDGE_URL</code> = عنوان REST للجسر ·{' '}
              <code dir="ltr">WHATSAPP_BRIDGE_SECRET</code> · اختياري{' '}
              <code dir="ltr">WHATSAPP_BRIDGE_INSTANCE</code> ·{' '}
              <code dir="ltr">WHATSAPP_OWNER_TO</code> لرقم المالك
            </li>
            <li>
              فحص:{' '}
              <code dir="ltr" className="break-all text-[10px]">
                GET …/api/webhooks/whatsapp?bridge=1
              </code>
            </li>
            <li>
              تيليجرام يبقى القناة المجانية بلا بنية تحتية — واتساب اختياري عبر
              الجسر فقط
            </li>
          </ol>
        </DevDisclosure>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          خزنة الماك{' '}
          <span className="font-normal text-ab-muted-soft">
            {macConfigured === null
              ? '· جاري الفحص…'
              : macConfigured === false
                ? '· غير مضبوطة'
                : macOnline
                  ? '· متصلة'
                  : '· مضبوطة · غير متصلة'}
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          لا يمكن تفعيلها من السحابة وحدها — تحتاج جهازك يعمل كوكيل + نفق عام.
        </p>
        <DevDisclosure summaryAr="خطوات الربط للمسؤول التقني">
          <ol className="list-decimal space-y-1 pe-4">
            <li>
              على الماك: <code dir="ltr">npm run storage:setup</code> (يشغّل
              الوكيل ويطبع السر)
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
        </DevDisclosure>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          CloudConvert{' '}
          <span className="font-normal text-ab-muted-soft">
            ·{' '}
            {cloudConvertStatusAr ||
              (cloudConvertConfigured
                ? 'اختياري مدفوع · مفعّل'
                : 'اختياري مدفوع')}
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          اختياري مدفوع — احتياطي بعد Google. بدون المفتاح لا ينكسر شيء: اربط
          Google أولاً (مجاني) أو استخدم التعديل الموضعي / إعادة البناء النصّية.
        </p>
        <DevDisclosure summaryAr="مفتاح CloudConvert (مسؤول)">
          <ol className="list-decimal space-y-1 pe-4">
            <li>
              أنشئ مفتاحاً من{' '}
              <a
                href="https://cloudconvert.com/dashboard/api/v2/keys"
                target="_blank"
                rel="noreferrer"
                className="text-ab-accent underline"
              >
                cloudconvert.com/dashboard
              </a>
            </li>
            <li>
              Netlify:{' '}
              <code dir="ltr">CLOUDCONVERT_API_KEY</code> ثم Redeploy
            </li>
            <li>
              الأداة:{' '}
              <code dir="ltr">convert_document</code> /{' '}
              <code dir="ltr">convert_file</code> تستخدم Google أولاً ثم
              CloudConvert؛ التعديل الموضعي مجاني عبر{' '}
              <code dir="ltr">edit_document(replacements)</code>
            </li>
          </ol>
          <p className="mt-2 text-[11px] text-stone-500">
            دليل:{' '}
            <span dir="ltr" className="font-mono">
              docs/file-edit-engines.md
            </span>
          </p>
        </DevDisclosure>
      </div>

      <div className="rounded-lg border border-ab-border bg-white p-3">
        <p className="mb-1 font-semibold text-ab-ink">
          جسر Cua{' '}
          <span className="font-normal text-ab-muted-soft">
            · {cuaStatusAr || (cuaConfigured === false ? 'غير متصل' : cuaOnline ? 'متصل' : 'غير متصل')}
          </span>
        </p>
        <p className="mb-1 text-[11px]">
          ثبّت Cua على جهازك ثم اربط العنوان هنا — لا يعمل داخل حاوية CranL مباشرة.
        </p>
        <DevDisclosure summaryAr="تثبيت وربط Cua (مسؤول)">
          <ol className="list-decimal space-y-1 pe-4">
            <li>
              ثبّت من{' '}
              <a
                href="https://cua.ai/cua-driver"
                target="_blank"
                rel="noreferrer"
                className="text-ab-accent underline"
              >
                cua.ai/cua-driver
              </a>
              :{' '}
              <code dir="ltr" className="break-all text-[10px]">
                /bin/bash -c &quot;$(curl -fsSL
                https://cua.ai/driver/install.sh)&quot;
              </code>
            </li>
            <li>
              شغّل الـ daemon:{' '}
              <code dir="ltr">cua-driver serve</code> ثم الجسر:{' '}
              <code dir="ltr">npm run cua:bridge</code> (منفذ 7430)
            </li>
            <li>
              نفق: <code dir="ltr">npx ngrok http 7430</code>
            </li>
            <li>
              Netlify:{' '}
              <code dir="ltr">CUA_BRIDGE_URL</code>=رابط النفق ·{' '}
              <code dir="ltr">CUA_BRIDGE_SECRET</code> (أو نفس{' '}
              <code dir="ltr">MAC_SYNC_SECRET</code>) ثم Redeploy
            </li>
            <li>
              من المساعدين: أداة{' '}
              <code dir="ltr">cua_computer</code> — إجراءات الإدخال تخضع لـ HITL
            </li>
          </ol>
          <p className="mt-2 text-[11px] text-stone-500">
            دليل:{' '}
            <span dir="ltr" className="font-mono">
              docs/cua-bridge.md
            </span>{' '}
            · مفتوح المصدر:{' '}
            <a
              href="https://github.com/trycua/cua"
              target="_blank"
              rel="noreferrer"
              className="text-ab-accent underline"
            >
              trycua/cua
            </a>
          </p>
        </DevDisclosure>
      </div>
    </div>
  )
}
