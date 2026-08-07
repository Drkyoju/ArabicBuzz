/**
 * OAuth scopes for Calendar, Gmail (read + send), Sheets, and Drive company brain.
 *
 * Re-consent / multi-account: تقويم الفريق → «Google / Gmail» → «ربط بريد Google (Gmail)»
 * (or «ربط بريد Google إضافي»). OAuth uses prompt=consent select_account so the owner
 * can pick the association Workspace mailbox (e.g. info@…) without replacing login,
 * and so gmail.send is granted after scope expansions.
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
