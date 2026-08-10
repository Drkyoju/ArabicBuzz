/**
 * Shared association voice for جمعية الهدى والحكمة mail drafts + templates.
 * Keep org IMAP drafts and ready templates on the same MSA register.
 */

export const ASSOCIATION_NAME_AR = 'جمعية الهدى والحكمة'

/** System line for generateObject / generateText. */
export const ASSOCIATION_DRAFT_SYSTEM_AR = `أنت كاتب مراسلات ${ASSOCIATION_NAME_AR}. تكتب عربية فصحى مهنية موجزة، تراعي المرفقات، ولا تختلق حقائق أو موافقات أو مواعيد غير موجودة في الرسالة.`

/**
 * Mandatory tone block injected into mail analyze prompts.
 * Stronger than a soft hint — models follow numbered constraints better.
 */
export const ASSOCIATION_TONE_RULES_AR = `نبرة الجمعية (إلزامية للمسودة — لا تحِد عنها):
1) الافتتاح حرفياً: السلام عليكم ورحمة الله وبركاته
2) التمثيل: تتكلم باسم ${ASSOCIATION_NAME_AR} بصيغة جمع مهذبة («نؤكّد»، «نرجو»، «نشكر») — بلا «أنا» الشخصية
3) الأسلوب: رسمي، مهذب، مختصر (٢–٥ فقرات قصيرة). ممنوع المبالغة التسويقية والإيموجي والاختصارات العامية
4) الحقائق: لا تختلق موافقات أو مبالغ أو مواعيد أو أرقاماً غير موجودة في الرسالة أو المرفقات؛ إن نقصت معلومة اطلبها بوضوح
5) المرفقات: إن وُجدت أشر لمحتواها بسطر واحد واطلب استكمالاً إن لزم
6) الختام حرفياً بعد سطر فارغ:
مع خالص التحية،
إدارة الجمعية
7) خصّص الرد لموضوع الرسالة — لا تلصق قالباً جاهزاً بلا صلة؛ لا تكرّر اسم الجمعية أكثر من مرة في المتن
8) إن كانت الرسالة الواردة إنجليزية يمكن الرد بالإنجليزية مع الإبقاء على الملخص بالعربية؛ الخاتمة الإنجليزية: With kind regards, / Association Administration`

/** Heuristic fallback when the model path fails — still on-tone. */
export function associationFallbackDraftBody(opts: {
  subject?: string
  attachmentNote?: string
}): string {
  const subject = (opts.subject || '—').trim() || '—'
  const att = (opts.attachmentNote || '').trim()
  return `السلام عليكم ورحمة الله وبركاته،

نشكر تواصلكم مع ${ASSOCIATION_NAME_AR}. تلقّينا رسالتكم بخصوص «${subject}»${
    att ? ` والمرفقات المشار إليها (${att})` : ''
  }، وسنراجعها ونعود إليكم في أقرب وقت مناسب.

مع خالص التحية،
إدارة الجمعية`
}

/**
 * Light post-check: ensure opening/closing markers exist when the model drifts.
 * Does not invent content — only prepends/appends canonical framing if missing.
 */
export function ensureAssociationToneFraming(body: string): string {
  let out = String(body || '').trim()
  if (!out) {
    return associationFallbackDraftBody({})
  }
  if (!/السلام عليكم/.test(out)) {
    out = `السلام عليكم ورحمة الله وبركاته،\n\n${out}`
  }
  if (!/مع خالص التحية/.test(out) && !/With kind regards/i.test(out)) {
    out = `${out.replace(/\s+$/, '')}\n\nمع خالص التحية،\nإدارة الجمعية`
  }
  return out
}
