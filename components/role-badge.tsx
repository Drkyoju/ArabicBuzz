'use client'

import { cn } from '@/lib/utils'

/** Compact Arabic role chip: مدير / موظف / مسؤول */
export function RoleBadge({
  labelAr,
  className,
}: {
  labelAr: string
  className?: string
}) {
  const tone =
    labelAr === 'مسؤول'
      ? 'border-stone-700 bg-stone-800 text-white'
      : labelAr === 'مدير'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-stone-200 bg-stone-50 text-stone-700'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        tone,
        className
      )}
    >
      {labelAr}
    </span>
  )
}
