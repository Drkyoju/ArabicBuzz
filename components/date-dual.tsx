'use client'

/** Hijri primary + Gregorian muted — association reports expect both. */
export function DateDual({
  value = new Date(),
  className,
}: {
  value?: Date
  className?: string
}) {
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
  const gregorian = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value)

  return (
    <div className={className}>
      <p className="text-[13px] font-medium text-ab-ink">{hijri}</p>
      <p className="text-[11px] text-stone-400" dir="ltr">
        {gregorian}
      </p>
    </div>
  )
}
