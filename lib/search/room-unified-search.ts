/**
 * Privacy-safe unified room search: org mail + room/knowledge files + room calendar.
 * Shared by /api/search/unified and the room_search agent tool (Telegram parity).
 * Never searches other users' personal Gmail.
 */
import { searchOrgMailCorpus } from '@/lib/email/mail-corpus-search'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

export type RoomUnifiedHit = {
  kind: string
  id: string
  titleAr: string
  snippet: string
  href?: string
  privacy: 'org_or_room' | 'room_calendar'
  fileId?: string
  scopeId?: string
  startsAt?: string
  from?: string
  folder?: string
}

export async function searchRoomUnified(opts: {
  query: string
  scopeId?: string
  limit?: number
}): Promise<{
  ok: true
  q: string
  scopeId: string
  hits: RoomUnifiedHit[]
  excludesPersonalGmail: true
  messageAr: string
}> {
  const q = (opts.query || '').trim()
  const scopeId = opts.scopeId || PRIMARY_TEAM_SCOPE_ID
  const limit = Math.min(Math.max(opts.limit || 24, 1), 40)

  if (!q) {
    return {
      ok: true,
      q,
      scopeId,
      hits: [],
      excludesPersonalGmail: true,
      messageAr:
        'اكتب كلمة للبحث في بريد الجمعية وملفات الغرفة والتقويم — دون بريد الأعضاء الشخصي.',
    }
  }

  const [corpus, events] = await Promise.all([
    searchOrgMailCorpus({
      query: q,
      limit,
      includeFiles: true,
      scopeId,
    }).catch(() => ({
      hits: [] as Awaited<ReturnType<typeof searchOrgMailCorpus>>['hits'],
      messageAr: '',
    })),
    listRoomCalendarEvents({
      scopeId,
      from: new Date(Date.now() - 30 * 86400_000).toISOString(),
      to: new Date(Date.now() + 90 * 86400_000).toISOString(),
    }).catch(() => []),
  ])

  const needle = q.toLowerCase()
  const calHits: RoomUnifiedHit[] = events
    .filter(
      (e) =>
        e.titleAr.toLowerCase().includes(needle) ||
        (e.descriptionAr || '').toLowerCase().includes(needle) ||
        (e.locationAr || '').toLowerCase().includes(needle)
    )
    .slice(0, 8)
    .map((e) => ({
      kind: 'calendar',
      id: e.id,
      titleAr: e.titleAr,
      snippet: [
        e.locationAr,
        e.descriptionAr?.slice(0, 120),
        new Date(e.startsAt).toLocaleString('ar-SA', {
          timeZone: 'Asia/Riyadh',
        }),
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/?section=calendar`,
      scopeId,
      startsAt: e.startsAt,
      privacy: 'room_calendar' as const,
    }))

  const hits: RoomUnifiedHit[] = [
    ...corpus.hits.map((h) => ({
      ...h,
      privacy: 'org_or_room' as const,
    })),
    ...calHits,
  ].slice(0, limit)

  return {
    ok: true,
    q,
    scopeId,
    hits,
    excludesPersonalGmail: true,
    messageAr: hits.length
      ? `وُجد ${hits.length} نتيجة (بريد الجمعية · ملفات · تقويم الغرفة).`
      : 'لا نتائج — جرّب كلمة أخرى. البحث لا يشمل بريد الأعضاء الشخصي.',
  }
}
