'use client'

/**
 * Auth setup checklist — email is primary; OAuth optional.
 */
export function AuthSetupHint() {
  return (
    <div
      className="rounded-lg border border-ab-border bg-ab-surface p-4 text-sm"
      dir="rtl"
    >
      <h3 className="mb-2 font-semibold">تسجيل الدخول بالبريد</h3>
      <ol className="list-decimal space-y-1 pr-5 text-xs text-stone-600">
        <li>
          Supabase → Authentication → Providers → <strong>Email</strong> يجب أن
          يكون مفعّلاً (افتراضي).
        </li>
        <li>
          للتجربة السريعة: عطّل «Confirm email» تحت Email حتى يدخل الزملاء فوراً
          بعد إنشاء الحساب.
        </li>
        <li>
          URL Configuration:
          <br />
          Site URL = <code dir="ltr">https://arabicbuzz.netlify.app</code>
          <br />
          Redirect ={' '}
          <code dir="ltr">https://arabicbuzz.netlify.app/auth/callback</code>
        </li>
        <li>Google / GitHub اختياري من زر «أو استخدم Google / GitHub».</li>
      </ol>
    </div>
  )
}
