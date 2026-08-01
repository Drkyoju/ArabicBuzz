/** OAuth scopes for Calendar + reading invite mail. */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ')

export const GOOGLE_CALENDAR_SCOPE_LIST = GOOGLE_CALENDAR_SCOPES.split(' ')
