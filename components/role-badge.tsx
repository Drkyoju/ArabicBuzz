'use client'

import { cn } from '@/lib/utils'

/** Compact Arabic association-domain role chip */
export function RoleBadge({
  labelAr,
  className,
}: {
  labelAr: string
  className?: string
}) {
  const tone =
    labelAr.includes('مجلس') || labelAr.includes('إدارة')
      ? 'border-stone-700 bg-stone-800 text-white'
      : labelAr.includes('مدير') || labelAr.includes('لجنة')
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : labelAr.includes('مدقق')
          ? 'border-amber-200 bg-amber-50 text-amber-950'
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
