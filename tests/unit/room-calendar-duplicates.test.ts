import { describe, expect, it } from 'vitest'
import {
  findRoomDuplicateGroups,
  type RoomCalendarEvent,
} from '@/lib/rooms/room-calendar'

function ev(
  partial: Partial<RoomCalendarEvent> &
    Pick<RoomCalendarEvent, 'id' | 'titleAr' | 'startsAt' | 'endsAt'>
): RoomCalendarEvent {
  return {
    scopeId: 'shared-demo',
    descriptionAr: null,
    allDay: false,
    locationAr: null,
    attendees: [],
    source: 'manual',
    createdBy: null,
    createdByAr: 'عضو',
    status: 'confirmed',
    googleEventId: null,
    meta: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  }
}

describe('findRoomDuplicateGroups', () => {
  it('flags exact copy same title and start minute', () => {
    const groups = findRoomDuplicateGroups([
      ev({
        id: 'a',
        titleAr: 'اجتماع مجلس الإدارة',
        startsAt: '2026-08-10T07:00:00.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
      }),
      ev({
        id: 'b',
        titleAr: 'اجتماع مجلس الإدارة',
        startsAt: '2026-08-10T07:00:30.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
        createdByAr: 'سارة',
        source: 'google_sync',
      }),
    ])
    expect(groups.some((g) => g.kind === 'exact_copy')).toBe(true)
  })

  it('flags same title within ±2 hours', () => {
    const groups = findRoomDuplicateGroups([
      ev({
        id: 'a',
        titleAr: 'لقاء المتطوعين',
        startsAt: '2026-08-10T07:00:00.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
      }),
      ev({
        id: 'b',
        titleAr: 'لقاء المتطوعين',
        startsAt: '2026-08-10T08:30:00.000Z',
        endsAt: '2026-08-10T09:30:00.000Z',
      }),
    ])
    expect(groups.some((g) => g.kind === 'same_title_near_time')).toBe(true)
  })

  it('flags time overlap without matching titles', () => {
    const groups = findRoomDuplicateGroups([
      ev({
        id: 'a',
        titleAr: 'موعد أ',
        startsAt: '2026-08-10T07:00:00.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
      }),
      ev({
        id: 'b',
        titleAr: 'موعد ب',
        startsAt: '2026-08-10T07:30:00.000Z',
        endsAt: '2026-08-10T08:30:00.000Z',
      }),
    ])
    expect(groups.some((g) => g.kind === 'time_overlap')).toBe(true)
  })

  it('ignores cancelled events', () => {
    const groups = findRoomDuplicateGroups([
      ev({
        id: 'a',
        titleAr: 'نفس العنوان',
        startsAt: '2026-08-10T07:00:00.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
      }),
      ev({
        id: 'b',
        titleAr: 'نفس العنوان',
        startsAt: '2026-08-10T07:00:00.000Z',
        endsAt: '2026-08-10T08:00:00.000Z',
        status: 'cancelled',
      }),
    ])
    expect(groups).toHaveLength(0)
  })
})
