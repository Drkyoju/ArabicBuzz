import type { RoomMember } from '@/lib/rooms/persist'

export type MentionableMember = {
  userId: string | null
  email: string | null
  displayNameAr: string
  /** Token usable after @ (no spaces) */
  mentionToken: string
}

export function memberMentionToken(nameAr: string): string {
  return nameAr.replace(/\s+/g, '').slice(0, 40)
}

export function toMentionableMembers(members: RoomMember[]): MentionableMember[] {
  return members.map((m) => ({
    userId: m.userId,
    email: m.email,
    displayNameAr: m.displayNameAr,
    mentionToken: memberMentionToken(m.displayNameAr),
  }))
}

/** Extract @tokens that match room members (not agents — caller filters agents first). */
export function extractMemberMentions(
  text: string,
  members: MentionableMember[]
): MentionableMember[] {
  if (!text || !members.length) return []
  const tokens = new Set<string>()
  const re = /@([\u0600-\u06FFa-zA-Z0-9_\-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    tokens.add(m[1])
  }
  if (!tokens.size) return []

  const found: MentionableMember[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const hit = members.find((mem) => {
      if (mem.mentionToken === token) return true
      if (mem.userId && mem.userId === token) return true
      if (mem.displayNameAr === token) return true
      if (mem.displayNameAr.replace(/\s+/g, '') === token) return true
      // Partial: token is prefix of name without spaces
      const compact = mem.displayNameAr.replace(/\s+/g, '')
      return compact.startsWith(token) && token.length >= 2
    })
    if (!hit) continue
    const key = hit.userId || hit.email || hit.displayNameAr
    if (seen.has(key)) continue
    seen.add(key)
    found.push(hit)
  }
  return found
}

/** Agents take priority for leading @ — strip leading agent token before member scan if needed. */
export function isTeamBroadcastMention(token: string): boolean {
  return /^(all|team|الجميع|فريق)$/i.test(token)
}
