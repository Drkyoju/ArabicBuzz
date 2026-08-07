'use client'

/**
 * Google OAuth setup + Production publish checklist (Arabic).
 * Ops only — end users just click «ربط Google» in-app.
 * Publish app in Google Console cannot be done by code — owner must click.
 */
export function GoogleSetupChecklist({
  className,
  focus = 'all',
  defaultOpen = false,
}: {
  className?: string
  focus?: 'all' | 'calendar' | 'drive'
  /** Open the details by default (e.g. when Drive is not linked). */
  defaultOpen?: boolean
}) {
  const lastStep =
    focus === 'calendar'
      ? 'ثم من تقويم الفريق → «Google / Gmail» اضغط «ربط بريد Google (Gmail)» واختر بريد Workspace للجمعية'
      : focus === 'drive'
        ? 'ثم من الإعدادات → عقل الشركة / Drive اضغط «١) ربط Google (Drive)» — مطلوب لتحويل PDF→Word النظيف'
        : 'ثم اربط Google من تقويم الفريق أو Drive (زر الربط داخل التطبيق)'

  return (
    <details className={className} dir="rtl" open={defaultOpen || undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-stone-600">
        إعداد Google للمسؤول — انشر التطبيق (Publish) في Console
      </summary>
      <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
        <p className="font-semibold">مهم — لا يمكن للكود نشر التطبيق نيابةً عنك</p>
        <p className="mt-1">
          يجب أن يفتح المالك Google Cloud Console ويضغط{' '}
          <strong>Publish app</strong> مرة واحدة. بدونها يظهر «تطبيق غير موثّق»
          لغير Test users.
        </p>
        <a
          href="https://console.cloud.google.com/apis/credentials/consent"
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block font-semibold text-ab-accent underline"
          dir="ltr"
        >
          فتح OAuth consent screen → Publish
        </a>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        للمالك الذي يملك حساب Google Cloud فقط. المستخدم العادي يضغط «ربط
        Google» داخل الموقع — لا يحتاج هذه القائمة.
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pe-4 text-[11px] leading-relaxed text-stone-600">
        <li>
          شاشة موافقة OAuth: اسم التطبيق{' '}
          <span className="font-medium">Arabic Buzz</span> · سياسة الخصوصية{' '}
          <a
            href="https://arabicbuzz-fooc9h.cranl.net/privacy"
            className="text-ab-accent underline"
            target="_blank"
            rel="noreferrer"
            dir="ltr"
          >
            arabicbuzz-fooc9h.cranl.net/privacy
          </a>{' '}
          · النطاقات: <span dir="ltr">cranl.net</span> و{' '}
          <span dir="ltr">supabase.co</span>
          {' '}(أبقِ Netlify إن بقي كاحتياطي)
        </li>
        <li>
          <strong className="text-ab-ink">نشر التطبيق (إلزامي):</strong>{' '}
          Consent Screen → Publishing status → إن كان Testing فاضغط{' '}
          <strong className="text-ab-ink">Publish app</strong> → Production
          (أو أضف كل زميل كـ Test user مؤقتاً)
        </li>
        <li>
          Credentials: OAuth Web Client — Redirect فقط{' '}
          <span dir="ltr" className="font-mono text-[10px]">
            …supabase.co/auth/v1/callback
          </span>
          {' '}· Origins:{' '}
          <span dir="ltr" className="font-mono text-[10px]">
            https://arabicbuzz-fooc9h.cranl.net
          </span>
        </li>
        <li>فعّل APIs: Calendar · Gmail · Sheets · Drive</li>
        <li>فعّل موفّر Google في Supabase + انسخ Client ID/Secret لـ CranL env</li>
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
