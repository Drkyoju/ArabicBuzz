'use client'

/**
 * Google OAuth setup + Production publish checklist (Arabic).
 * Ops only — end users just click «ربط Google» in-app.
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
      ? 'ثم من تقويم الفريق → «Google / Gmail» اضغط «ربط بريد Google (Gmail)» واختر بريد Workspace للجمعية'
      : focus === 'drive'
        ? 'ثم من الإعدادات → عقل الشركة / Drive اضغط «١) ربط Google (Drive)» — مطلوب لتحويل PDF→Word النظيف'
        : 'ثم اربط Google من تقويم الفريق أو Drive (زر الربط داخل التطبيق)'

  return (
    <details className={className} dir="rtl">
      <summary className="cursor-pointer text-sm font-semibold text-stone-600">
        إعداد Google للمسؤول (نشر Production + خصوصية)
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        للمالك الذي يملك حساب Google Cloud فقط. المستخدم العادي يضغط «ربط
        Google» داخل الموقع — لا يحتاج هذه القائمة.
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pe-4 text-[11px] leading-relaxed text-stone-600">
        <li>
          شاشة موافقة OAuth: اسم التطبيق{' '}
          <span className="font-medium">Arabic Buzz</span> · سياسة الخصوصية{' '}
          <a
            href="https://arabicbuzz.netlify.app/privacy"
            className="text-ab-accent underline"
            target="_blank"
            rel="noreferrer"
            dir="ltr"
          >
            arabicbuzz.netlify.app/privacy
          </a>{' '}
          · النطاقات: <span dir="ltr">arabicbuzz.netlify.app</span> و{' '}
          <span dir="ltr">supabase.co</span>
        </li>
        <li>
          <strong className="text-ab-ink">نشر التطبيق:</strong> Consent Screen →
          Publishing status → إن كان Testing فاضغط{' '}
          <strong>Publish app</strong> → Production (أو أضف كل زميل كـ Test
          user)
        </li>
        <li>
          Credentials: OAuth Web Client — Redirect فقط{' '}
          <span dir="ltr" className="font-mono text-[10px]">
            …supabase.co/auth/v1/callback
          </span>
        </li>
        <li>فعّل APIs: Calendar · Gmail · Sheets · Drive</li>
        <li>فعّل موفّر Google في Supabase + انسخ Client ID/Secret لـ Netlify</li>
        <li>{lastStep}</li>
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        الدليل الكامل:{' '}
        <span dir="ltr" className="font-mono">
          docs/google-oauth-ar.md
        </span>
        . صلاحيات التقويم/Drive قد تُظهر تحذير Google حتى اكتمال Verification —
        طبيعي بعد تقليل نطاقات تسجيل الدخول.
      </p>
    </details>
  )
}
