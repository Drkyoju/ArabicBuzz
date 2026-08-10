/**
 * Client-side focus for بريد الجمعية — so room agents know the open message.
 */

export const ORG_MAIL_FOCUS_KEY = 'ab-org-mail-focus'
export const ORG_MAIL_DRAFT_EVENT = 'ab-org-mail-draft'
export const ORG_MAIL_FOCUS_EVENT = 'ab-org-mail-focus'

export type OrgMailFocus = {
  messageId: string
  subject: string
  from: string
  at: string
}

export type OrgMailDraftEventDetail = {
  messageId: string
  draftSubject: string
  draftBody: string
  summaryAr?: string
}

export function readOrgMailFocus(): OrgMailFocus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(ORG_MAIL_FOCUS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OrgMailFocus
    if (!parsed?.messageId) return null
    return parsed
  } catch {
    return null
  }
}

export function writeOrgMailFocus(
  focus: Omit<OrgMailFocus, 'at'> | null
): void {
  if (typeof window === 'undefined') return
  try {
    if (!focus?.messageId) {
      sessionStorage.removeItem(ORG_MAIL_FOCUS_KEY)
      window.dispatchEvent(new Event(ORG_MAIL_FOCUS_EVENT))
      return
    }
    const payload: OrgMailFocus = {
      messageId: focus.messageId,
      subject: focus.subject || '',
      from: focus.from || '',
      at: new Date().toISOString(),
    }
    sessionStorage.setItem(ORG_MAIL_FOCUS_KEY, JSON.stringify(payload))
    window.dispatchEvent(
      new CustomEvent(ORG_MAIL_FOCUS_EVENT, { detail: payload })
    )
  } catch {
    /* ignore */
  }
}

export function dispatchOrgMailDraft(detail: OrgMailDraftEventDetail): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(ORG_MAIL_DRAFT_EVENT, { detail })
    )
  } catch {
    /* ignore */
  }
}
