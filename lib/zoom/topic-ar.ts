/**
 * Soft Arabic display labels for Zoom API English topics.
 * Does not rewrite custom Arabic titles from the room calendar.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/

const DEFAULT_TOPIC_MAP: Array<{ re: RegExp; labelAr: string }> = [
  { re: /^personal meeting room$/i, labelAr: 'غرفة الاجتماع الشخصي' },
  { re: /^my meeting$/i, labelAr: 'اجتماعي' },
  { re: /^zoom meeting$/i, labelAr: 'اجتماع Zoom' },
  { re: /^meeting$/i, labelAr: 'اجتماع' },
  { re: /^instant meeting$/i, labelAr: 'اجتماع فوري' },
  { re: /^recurring meeting$/i, labelAr: 'اجتماع متكرر' },
  { re: /^weekly meeting$/i, labelAr: 'اجتماع أسبوعي' },
  { re: /^daily meeting$/i, labelAr: 'اجتماع يومي' },
  { re: /^test meeting$/i, labelAr: 'اجتماع تجريبي' },
]

/**
 * Display topic for UI. Known Zoom English defaults → Arabic;
 * Arabic titles left as-is; other English kept with a light prefix.
 */
export function formatZoomTopicAr(topic: string | undefined | null): string {
  const t = String(topic || '').trim()
  if (!t) return 'اجتماع Zoom'
  if (ARABIC_SCRIPT.test(t)) return t
  for (const { re, labelAr } of DEFAULT_TOPIC_MAP) {
    if (re.test(t)) return labelAr
  }
  // Custom English title from Zoom — keep text, add Arabic cue.
  if (/^[A-Za-z0-9][\w\s\-–—:.,'()]{0,120}$/.test(t)) {
    return `اجتماع Zoom: ${t}`
  }
  return t
}
