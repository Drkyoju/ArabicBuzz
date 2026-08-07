/**
 * Room chat retention — Asia/Riyadh calendar day + auto-prune older posts.
 * Deletes `room_posts` rows only; does not touch `workspace_files` (ملفات الفريق).
 */

import { riyadhDayBoundsIso } from '@/lib/telegram/fast-path'

export const ROOM_CHAT_RETENTION_DAYS_DEFAULT = 4

function riyadhYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Clamp env / override to a sane window (1–30 days). */
export function roomChatRetentionDays(override?: number): number {
  const raw =
    override ??
    Number.parseInt(String(process.env.ROOM_CHAT_RETENTION_DAYS || ''), 10)
  if (!Number.isFinite(raw)) return ROOM_CHAT_RETENTION_DAYS_DEFAULT
  return Math.min(30, Math.max(1, Math.floor(raw)))
}

/** ISO cutoff: posts with created_at strictly before this are expired. */
export function roomChatRetentionCutoffIso(days?: number): string {
  const keep = roomChatRetentionDays(days)
  const now = Date.now()
  const ms = keep * 24 * 60 * 60 * 1000
  return new Date(now - ms).toISOString()
}

/** Saudi calendar «today» bounds for bulk delete. */
export function riyadhTodayPostBoundsIso(): {
  from: string
  to: string
  ymd: string
} {
  const ymd = riyadhYmd()
  const { from, to } = riyadhDayBoundsIso(ymd)
  return { from, to, ymd }
}

export function isPostInRiyadhToday(createdAtMs: number): boolean {
  const { from, to } = riyadhTodayPostBoundsIso()
  const t = createdAtMs
  return t >= Date.parse(from) && t <= Date.parse(to)
}
