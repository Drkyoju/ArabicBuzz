'use client'

const REDIRECT =
  'https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback'

/**
 * What only the owner can finish (OAuth secrets).
 */
export function GoogleSetupChecklist({
  className,
  focus = 'all',
}: {
  className?: string
  focus?: 'all' | 'calendar' | 'drive'
}) {
  const lastStep =
    focus === 'calendar'
      ? 'هنا: اضغط «ربط تقويم Google» ثم أضف بريد الأعضاء واحجز اجتماعاً'
      : focus === 'drive'
        ? 'هنا: اضغط «ربط Google» ثم «مزامنة المجلد» لعقل الشركة'
        : 'هنا: اربط Google من التقويم أو Drive ثم زامن المجلد عند الحاجة'

  return (
    <div className={className} dir="rtl">
      <h3 className="text-sm font-semibold text-ab-ink">
        إعداد Google — خطواتك
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        التطبيق جاهز برمجياً. الربط يعمل بعد هذه الخطوات في حسابك:
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pe-4 text-[11px] leading-relaxed text-stone-700">
        <li>
          Google Cloud → OAuth Client (Web) → Redirect URI:{' '}
          <code className="break-all font-mono text-[10px]" dir="ltr">
            {REDIRECT}
          </code>
        </li>
        <li>فعّل APIs: Calendar + Drive (+ Gmail لدعوات Zoom في البريد)</li>
        <li>
          Supabase → Authentication → Providers → Google → Enable + Client
          ID/Secret
        </li>
        <li>
          Netlify →{' '}
          <code className="font-mono text-[10px]" dir="ltr">
            GOOGLE_CLIENT_ID
          </code>{' '}
          و{' '}
          <code className="font-mono text-[10px]" dir="ltr">
            GOOGLE_CLIENT_SECRET
          </code>{' '}
          ثم Redeploy
        </li>
        <li>{lastStep}</li>
      </ol>
    </div>
  )
}
