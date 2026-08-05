'use client'

import { ChevronDown, Terminal } from 'lucide-react'

/**
 * Collapsed shell for infrastructure detail (env-var names, tunnels, CLI).
 * Association staff should never meet `BRAIN_PRIMARY` unless they ask for it.
 */
export function DevDisclosure({
  children,
  summaryAr = 'تفاصيل تقنية للمسؤول',
  className,
}: {
  children: React.ReactNode
  summaryAr?: string
  className?: string
}) {
  return (
    <details
      dir="rtl"
      className={
        className ||
        'group rounded-lg border border-dashed border-ab-border bg-stone-50/70 px-2.5 py-1.5'
      }
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-stone-500 hover:text-ab-ink">
        <Terminal className="h-3 w-3" aria-hidden />
        {summaryAr}
        <ChevronDown
          className="h-3 w-3 transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-2 text-[11px] leading-relaxed text-stone-600">
        {children}
      </div>
    </details>
  )
}
