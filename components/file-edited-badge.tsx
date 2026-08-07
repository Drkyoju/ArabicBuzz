import { EDITED_TAG_AR } from '@/lib/files/edited-status'
import { cn } from '@/lib/utils'

/** Compact Arabic badge for edited workspace files. */
export function FileEditedBadge({
  className,
  show = true,
}: {
  className?: string
  show?: boolean
}) {
  if (!show) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        'bg-emerald-100 text-emerald-800',
        className
      )}
      title={EDITED_TAG_AR}
    >
      {EDITED_TAG_AR}
    </span>
  )
}
