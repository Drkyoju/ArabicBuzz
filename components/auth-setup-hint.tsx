'use client'

/** Auth setup notes — email works via service_role admin APIs. */
export function AuthSetupHint() {
  return (
    <div
      className="rounded-lg border border-ab-border bg-ab-surface p-4 text-sm"
      dir="rtl"
    >
      <h3 className="mb-2 font-semibold">تسجيل الدخول بالبريد</h3>
      <p className="mb-2 text-xs text-stone-600">
        إنشاء الحساب يتم عبر الخادم بمفتاح service_role مع تأكيد فوري — لا حاجة
        لتعطيل Confirm email يدوياً.
      </p>
      <ol className="list-decimal space-y-1 pr-5 text-xs text-stone-600">
        <li>
          Site URL / Redirect في Authentication → URL Configuration:
          <br />
          <code dir="ltr">https://arabicbuzz.netlify.app</code>
          <br />
          <code dir="ltr">https://arabicbuzz.netlify.app/auth/callback</code>
        </li>
        <li>
          لتغيير إعدادات المزودين من لوحة التحكم برمجياً يلزم{' '}
          <strong>Personal Access Token</strong> من حساب Supabase (ليس مفتاح
          المشروع anon/service_role).
        </li>
        <li>Google / GitHub اختياري من الواجهة.</li>
      </ol>
    </div>
  )
}
