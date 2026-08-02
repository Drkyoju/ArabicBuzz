'use client'

const REDIRECT =
  'https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback'

/**
 * What only the owner can finish (OAuth secrets) — shown in settings.
 */
export function GoogleSetupChecklist({ className }: { className?: string }) {
  return (
    <div
      className={className}
      dir="rtl"
    >
      <h3 className="text-sm font-semibold text-ab-ink">
        إعداد Google (Drive + تقويم) — خطواتك
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        التطبيق جاهز برمجياً. الربط يعمل فقط بعد هذه الخطوات في حسابك:
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pe-4 text-[11px] leading-relaxed text-stone-700">
        <li>
          Google Cloud → OAuth Client (Web) → Authorized redirect URI بالضبط:{' '}
          <code className="break-all font-mono text-[10px]" dir="ltr">
            {REDIRECT}
          </code>
        </li>
        <li>
          فعّل APIs: Calendar + Drive (+ Gmail إن أردت دعوات Zoom)
        </li>
        <li>
          Supabase → Authentication → Providers → Google → Enable + الصق Client
          ID و Client Secret
        </li>
        <li>
          Netlify → Environment variables → نفس{' '}
          <code className="font-mono text-[10px]" dir="ltr">
            GOOGLE_CLIENT_ID
          </code>{' '}
          و{' '}
          <code className="font-mono text-[10px]" dir="ltr">
            GOOGLE_CLIENT_SECRET
          </code>{' '}
          ثم Redeploy
        </li>
        <li>
          هنا: اضغط «ربط Google» ثم «مزامنة المجلد» لعقل الشركة
        </li>
      </ol>
      <p className="mt-2 text-[10px] text-stone-400">
        مجلد العقل مضبوط: «ملفات الجمعية». بدون Client ID/Secret سيظهر خطأ
        «provider is not enabled».
      </p>
    </div>
  )
}
