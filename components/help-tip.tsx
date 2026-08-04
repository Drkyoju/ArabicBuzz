'use client'

import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Compact MSA tooltip for complex controls. */
export function HelpTip({
  textAr,
  className,
}: {
  textAr: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex align-middle text-stone-400 hover:text-ab-accent',
        className
      )}
      title={textAr}
      aria-label={textAr}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
    </span>
  )
}

export function LabeledWithHelp({
  labelAr,
  helpAr,
  children,
  className,
}: {
  labelAr: string
  helpAr: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={className} dir="rtl">
      <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-stone-600">
        {labelAr}
        <HelpTip textAr={helpAr} />
      </p>
      {children}
    </div>
  )
}
