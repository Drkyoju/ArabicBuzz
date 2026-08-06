/** Drop QA/debug noise and stale empty-brain system posts from room feeds. */
export function isNoiseRoomPost(content: string): boolean {
  const c = (content || '').trim()
  if (!c) return true
  if (c === 'x' || c === 'guest-probe') return true
  if (c.includes('guest-probe')) return true
  if (c.includes('واحدةحدة')) return true
  if (c.includes('المجلد فارغ أو لا يمكن قراءته')) return true
  // Drive sync progress pings — keep the feed readable
  if (c.startsWith('📁 جُلسة مزامنة سحابية:')) return true
  if (c.startsWith('📁 اكتملت مزامنة عقل الشركة')) return true
  return false
}
