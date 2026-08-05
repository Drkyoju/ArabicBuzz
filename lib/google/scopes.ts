/**
 * OAuth scopes for Calendar, Gmail (read + send), Sheets, and Drive company brain.
 *
 * Re-consent required when scopes expand (e.g. gmail.send added after gmail.readonly):
 * Settings → «ربط تقويم Google». OAuth uses prompt=consent select_account so Google
 * issues a fresh grant including gmail.send. Existing tokens without send will fail
 * gmail_send until the user re-links.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')

export const GOOGLE_CALENDAR_SCOPE_LIST = GOOGLE_CALENDAR_SCOPES.split(' ')

/** Alias — same consent covers Calendar + Gmail + Sheets + Drive brain. */
export const GOOGLE_WORKSPACE_SCOPES = GOOGLE_CALENDAR_SCOPES

/** Short tags stored on google_oauth_tokens.scopes after calendar link. */
export const GOOGLE_WORKSPACE_SCOPE_TAGS =
  'calendar,gmail.readonly,gmail.send,spreadsheets,drive.readonly'
