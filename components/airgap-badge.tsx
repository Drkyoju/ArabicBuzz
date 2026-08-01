type Props = { airGapped?: boolean }

export function AirGapBadge({ airGapped = false }: Props) {
  if (airGapped) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1 text-sm font-medium text-ab-accent border border-ab-accent/30">
        🔒 الوضع المحلي المغلق (متوافق مع حماية البيانات)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-3 py-1 text-sm font-medium text-stone-600 border border-ab-border">
      🌐 الوضع السحابي (Cloud Mode)
    </span>
  )
}
