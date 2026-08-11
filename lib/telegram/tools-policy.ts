/**
 * Telegram tool binding policy — keep prompts and tool surface aligned.
 * Personal Google calendar_* is for site/external invites; team agenda = room_calendar_*.
 * Association mail_* / gmail_* only when the user explicitly asked about mail.
 */
import type { ToolSet } from 'ai'

/** Personal Google Calendar tools — omit on @alhuda14bot full-room turns. */
export const TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS = [
  'calendar_list_events',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'calendar_scan_email',
  'calendar_find_duplicates',
  'calendar_find_alignment',
] as const

/** Association + personal inbox tools — only when work kind is mail (or explicit). */
export const TELEGRAM_OMIT_MAIL_UNLESS_ASKED_TOOLS = [
  'mail_search',
  'mail_corpus_search',
  'mail_read',
  'mail_draft_reply',
  'mail_send',
  'mail_sync',
  'gmail_search',
  'gmail_read',
  'gmail_send',
] as const

export type TelegramOmitPersonalCalendarTool =
  (typeof TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS)[number]

export type TelegramOmitMailUnlessAskedTool =
  (typeof TELEGRAM_OMIT_MAIL_UNLESS_ASKED_TOOLS)[number]

/** Drop personal calendar_* so agents cannot contradict room_calendar_* policy. */
export function omitTelegramPersonalCalendarTools(all: ToolSet): ToolSet {
  const out: ToolSet = { ...all }
  for (const name of TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS) {
    delete out[name]
  }
  return out
}

/**
 * Drop association and Gmail inbox tools unless the user explicitly asked about mail.
 * Prevents unsolicited digests via tool calls; group push stays separately gated.
 */
export function omitTelegramMailToolsUnlessAsked(
  all: ToolSet,
  allowMail: boolean
): ToolSet {
  if (allowMail) return all
  const out: ToolSet = { ...all }
  for (const name of TELEGRAM_OMIT_MAIL_UNLESS_ASKED_TOOLS) {
    delete out[name]
  }
  return out
}

export function isTelegramPersonalCalendarTool(name: string): boolean {
  return (TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS as readonly string[]).includes(
    name
  )
}

export function isTelegramMailUnlessAskedTool(name: string): boolean {
  return (TELEGRAM_OMIT_MAIL_UNLESS_ASKED_TOOLS as readonly string[]).includes(
    name
  )
}
