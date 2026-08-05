/**
 * OAuth scopes for Calendar, Gmail triage, Sheets, and Drive company brain.
 * Re-consent (prompt=consent) is required for users who linked before Sheets
 * was added — Settings → ربط تقويم Google.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')

export const GOOGLE_CALENDAR_SCOPE_LIST = GOOGLE_CALENDAR_SCOPES.split(' ')

/** Alias — same consent covers Calendar + Gmail + Sheets + Drive brain. */
export const GOOGLE_WORKSPACE_SCOPES = GOOGLE_CALENDAR_SCOPES
