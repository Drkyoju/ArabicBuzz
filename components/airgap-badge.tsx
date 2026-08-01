type Props = { airGapped?: boolean; compact?: boolean }

export function AirGapBadge({ airGapped = false, compact }: Props) {
  if (compact) {
    return (
      <span
        className={`inline-flex h-2 w-2 rounded-full ${
          airGapped ? 'bg-ab-accent' : 'bg-stone-300'
        }`}
        title={airGapped ? 'وضع محلي مغلق' : 'وضع سحابي'}
        aria-label={airGapped ? 'وضع محلي مغلق' : 'وضع سحابي'}
      />
    )
  }
  if (airGapped) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-ab-accent/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-ab-accent">
        محلي
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
      سحابي
    </span>
  )
}
