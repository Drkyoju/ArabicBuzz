'use client'

export function AuthSetupHint() {
  return (
    <div
      className="rounded-lg border border-ab-border bg-ab-surface p-4 text-sm"
      dir="rtl"
    >
      <h3 className="mb-2 font-semibold">دخول برمز البريد (OTP)</h3>
      <p className="text-xs text-stone-600">
        تكتب بريدك → يصل رمز إلى الإيميل → تدخله هنا. إن وصلت رسالة برابط أيضاً،
        يمكنك فتح الرابط مباشرة. البريد الافتراضي من Supabase له حد يومي؛ إن لم
        تصل الرسالة تحقق من مجلد الرسائل غير المرغوبة.
      </p>
    </div>
  )
}
