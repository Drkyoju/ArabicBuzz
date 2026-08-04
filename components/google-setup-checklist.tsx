'use client'

/**
 * Developer-only Google OAuth setup — collapsed by default in Settings.
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
      ? 'ثم اضغط «ربط تقويم Google» من قسم التقويم'
      : focus === 'drive'
        ? 'ثم اربط Google وزامن مجلد العقل من الإعدادات'
        : 'ثم اربط Google من التقويم أو Drive'

  return (
    <details className={className} dir="rtl">
      <summary className="cursor-pointer text-sm font-semibold text-stone-600">
        إعداد Google للمسؤول (تقني)
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        للمطوّر الذي يملك حساب Google Cloud / الاستضافة فقط — ليس للمستخدم
        العادي.
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pe-4 text-[11px] leading-relaxed text-stone-600">
        <li>أنشئ OAuth Client (Web) في Google Cloud مع Redirect الخاص بـ Auth</li>
        <li>فعّل Calendar API و Drive API</li>
        <li>فعّل موفّر Google في لوحة المصادقة</li>
        <li>أضف معرّفات العميل في متغيرات الاستضافة ثم أعد النشر</li>
        <li>{lastStep}</li>
      </ol>
    </details>
  )
}
