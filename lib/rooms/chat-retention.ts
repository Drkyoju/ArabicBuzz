/**
 * Room chat retention — Asia/Riyadh calendar day + auto-prune older posts.
 * Deletes `room_posts` rows only; does not touch `workspace_files` (ملفات الفريق).
 */

import { riyadhDayBoundsIso } from '@/lib/telegram/fast-path'

/** Default keep window for team chat (was 4 — extended for deep collaboration). */
export const ROOM_CHAT_RETENTION_DAYS_DEFAULT = 90

/** Association / primary team room — unlimited history unless env overrides. */
export const ROOM_CHAT_UNLIMITED_SCOPES_DEFAULT = ['shared-demo'] as const

function parseScopeList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Scopes that never auto-prune chat (association room default). */
export function roomChatUnlimitedScopes(): string[] {
  const fromEnv = parseScopeList(process.env.ROOM_CHAT_RETENTION_UNLIMITED_SCOPES)
  if (fromEnv.length) return fromEnv
  return [...ROOM_CHAT_UNLIMITED_SCOPES_DEFAULT]
}

export function isRoomChatRetentionUnlimited(scopeId: string): boolean {
  return roomChatUnlimitedScopes().includes(scopeId)
}

/** Clamp env / override to a sane window (1–3650 days). 0 = unlimited (caller checks scope). */
export function roomChatRetentionDays(override?: number): number {
  const raw =
    override ??
    Number.parseInt(String(process.env.ROOM_CHAT_RETENTION_DAYS || ''), 10)
  if (!Number.isFinite(raw)) return ROOM_CHAT_RETENTION_DAYS_DEFAULT
  if (raw <= 0) return 0
  return Math.min(3650, Math.max(1, Math.floor(raw)))
}

/** Per-scope retention: unlimited scopes return 0; else global days. */
export function roomChatRetentionDaysForScope(
  scopeId: string,
  override?: number
): number {
  if (isRoomChatRetentionUnlimited(scopeId)) return 0
  return roomChatRetentionDays(override)
}

/** ISO cutoff: posts with created_at strictly before this are expired. */
export function roomChatRetentionCutoffIso(days?: number): string | null {
  const keep = roomChatRetentionDays(days)
  if (keep <= 0) return null
  const now = Date.now()
  const ms = keep * 24 * 60 * 60 * 1000
  return new Date(now - ms).toISOString()
}

/** Human label for UI (Arabic). */
export function roomChatRetentionLabelAr(scopeId: string): string {
  if (isRoomChatRetentionUnlimited(scopeId)) {
    return 'أرشيف الشات: غير محدود (غرفة الجمعية)'
  }
  const days = roomChatRetentionDaysForScope(scopeId)
  return `أرشيف الشات: ${days} يوماً`
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

function riyadhYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function isPostInRiyadhToday(createdAtMs: number): boolean {
  const { from, to } = riyadhTodayPostBoundsIso()
  const t = createdAtMs
  return t >= Date.parse(from) && t <= Date.parse(to)
}
