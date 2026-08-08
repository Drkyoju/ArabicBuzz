/**
 * Sign-in only — non-sensitive Google scopes.
 * Keep login on these so users avoid Google’s “unverified app” / advanced
 * warning screens that appear when Calendar/Gmail/Drive are requested up front.
 * Workspace APIs are linked later via `connectGoogleCalendar()`.
 */
export const GOOGLE_LOGIN_SCOPES = ['openid', 'email', 'profile'].join(' ')

/**
 * OAuth scopes for Calendar, Gmail (read + send), Sheets, and Drive company brain.
 *
 * Re-consent / multi-account: تقويم الفريق → «Google / Gmail» → «ربط بريد Google (Gmail)»
 * (or «ربط بريد Google إضافي»). OAuth uses prompt=consent select_account so the owner
 * can pick the association Workspace mailbox (e.g. info@…) without replacing login,
 * and so gmail.send is granted after scope expansions.
 *
 * These scopes are sensitive/restricted — Google shows verification warnings until
 * the OAuth app is published + verified (see docs/google-oauth-ar.md).
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  // modify: mark read/unread, star, labels (needed for full personal mail client)
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')

export const GOOGLE_CALENDAR_SCOPE_LIST = GOOGLE_CALENDAR_SCOPES.split(' ')

/** Alias — same consent covers Calendar + Gmail + Sheets + Drive brain. */
export const GOOGLE_WORKSPACE_SCOPES = GOOGLE_CALENDAR_SCOPES

/** Short tags stored on google_oauth_tokens.scopes after calendar link. */
export const GOOGLE_WORKSPACE_SCOPE_TAGS =
  'calendar,gmail.readonly,gmail.send,gmail.modify,spreadsheets,drive.readonly,drive.file'
