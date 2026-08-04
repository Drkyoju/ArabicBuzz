export function QualityFlagBanner({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <p className="mt-2 border-e-2 border-ab-warn pe-3 text-sm text-ab-warn">
      ⚠️ تنبيه تدقيق: ينصح بمراجعة المصادر المرفقة للتحقق التام.
    </p>
  )
}
