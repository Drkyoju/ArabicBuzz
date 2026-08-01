export function SubagentProgressCard({
  roleNameAr,
  status,
}: {
  roleNameAr: string
  status: 'running' | 'done' | 'error'
}) {
  const badge =
    status === 'running'
      ? '[🔄 جاري المعالجة]'
      : status === 'done'
        ? '[✅ اكتمل]'
        : '[❌ خطأ]'
  return (
    <div className="mb-3 rounded-lg border border-ab-border bg-ab-bg px-3 py-2">
      <div className="text-sm font-medium">{roleNameAr}</div>
      <div className="mt-1 text-xs text-stone-600">{badge}</div>
    </div>
  )
}
