/**
 * Lightweight inbox priority / classify hints — no spam labels.
 * Heuristic first; optional AI fields from MailIntelCache override.
 */

export type MailPriority = 'high' | 'normal' | 'low'
export type MailClassify =
  | 'action'
  | 'meeting'
  | 'docs'
  | 'fyi'
  | 'newsletter'
  | 'other'

export type MailTriageHint = {
  priority: MailPriority
  classify: MailClassify
  labelAr: string
  sortBoost: number
}

const HIGH_RE =
  /عاجل|هام|مهم|فوري|خلال\s*\d+|موعد\s*نهائي|deadline|urgent|asap|يرجى\s*الرد|مطلوب\s*الرد|قبل\s*(غداً|الغد|نهاية)/iu
const MEETING_RE =
  /اجتماع|لقاء|موعد|zoom|meet\.google|دعوة|agenda|منصة\s*الاجتماع/iu
const DOCS_RE =
  /مرفق|مستند|ملف|فاتورة|محضر|توقيع|نموذج|pdf|docx|إرفاق/iu
const NEWS_RE =
  /نشرة|newsletter|unsubscribe|إلغاء\s*الاشتراك|no-?reply|noreply|تنويه\s*إعلاني/iu
const FYI_RE = /للعلم|fyi|إشعار|تأكيد\s*استلام|شكراً\s*لتواصلكم/iu

export function classifyMailTriage(input: {
  subject?: string | null
  snippet?: string | null
  from?: string | null
  seen?: boolean
  answered?: boolean
  hasAttachments?: boolean
  /** From intel_json when present */
  priority?: MailPriority | null
  classify?: MailClassify | null
}): MailTriageHint {
  if (input.priority && input.classify) {
    return {
      priority: input.priority,
      classify: input.classify,
      labelAr: triageLabelAr(input.priority, input.classify),
      sortBoost: sortBoostOf(input.priority, input.classify, input.seen),
    }
  }

  const blob = `${input.subject || ''} ${input.snippet || ''} ${input.from || ''}`
  const from = (input.from || '').toLowerCase()

  let classify: MailClassify = 'other'
  let priority: MailPriority = 'normal'

  if (NEWS_RE.test(blob) || /noreply|no-reply|mailer-daemon/i.test(from)) {
    classify = 'newsletter'
    priority = 'low'
  } else if (MEETING_RE.test(blob)) {
    classify = 'meeting'
    priority = HIGH_RE.test(blob) ? 'high' : 'normal'
  } else if (DOCS_RE.test(blob) || input.hasAttachments) {
    classify = 'docs'
    priority = HIGH_RE.test(blob) ? 'high' : 'normal'
  } else if (HIGH_RE.test(blob) || /action\s*required|يرجى\s*التكرم/iu.test(blob)) {
    classify = 'action'
    priority = 'high'
  } else if (FYI_RE.test(blob)) {
    classify = 'fyi'
    priority = 'low'
  } else if (!input.seen && !input.answered) {
    classify = 'action'
    priority = 'normal'
  }

  if (input.priority) priority = input.priority
  if (input.classify) classify = input.classify

  return {
    priority,
    classify,
    labelAr: triageLabelAr(priority, classify),
    sortBoost: sortBoostOf(priority, classify, input.seen),
  }
}

export function triageLabelAr(
  priority: MailPriority,
  classify: MailClassify
): string {
  const cls =
    classify === 'action'
      ? 'يتطلب رد'
      : classify === 'meeting'
        ? 'موعد'
        : classify === 'docs'
          ? 'مستندات'
          : classify === 'fyi'
            ? 'للعلم'
            : classify === 'newsletter'
              ? 'نشرة'
              : 'عام'
  if (priority === 'high') return `أولوية · ${cls}`
  if (priority === 'low') return cls
  return cls
}

function sortBoostOf(
  priority: MailPriority,
  classify: MailClassify,
  seen?: boolean
): number {
  let n = 0
  if (priority === 'high') n += 30
  if (priority === 'low') n -= 20
  if (classify === 'action' || classify === 'meeting') n += 10
  if (classify === 'newsletter') n -= 15
  if (seen === false) n += 5
  return n
}
