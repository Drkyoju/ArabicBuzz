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
      className={cn('ab-badge-edited', className)}
      title={EDITED_TAG_AR}
    >
      {EDITED_TAG_AR}
    </span>
  )
}
