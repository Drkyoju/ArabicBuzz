export function QualityFlagBanner({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <p className="mt-2 border-r-2 border-ab-warn pr-3 text-sm text-ab-warn">
      ⚠️ تنبيه تدقيق: ينصح بمراجعة المصادر المرفقة للتحقق التام.
    </p>
  )
}
