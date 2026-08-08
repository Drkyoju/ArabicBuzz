import { generateObject } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import {
  readGmailMessage,
  type GmailAttachmentMeta,
  type GmailMessageDetail,
} from '@/lib/google/gmail'

function modelSlug() {
  return IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-3.1-pro'
}

const analyzeSchema = z.object({
  summaryAr: z.string().describe('ملخص قصير بالعربية الفصحى'),
  draftSubject: z.string().describe('موضوع الرد'),
  draftBody: z
    .string()
    .describe('مسودة رد مهنية بالعربية (أو الإنجليزية إن كانت الرسالة إنجليزية)'),
  dates: z.array(z.string()).describe('تواريخ مذكورة أو مستنتجة'),
  times: z.array(z.string()).describe('أوقات مذكورة'),
  names: z.array(z.string()).describe('أسماء أشخاص أو جهات'),
  important: z
    .array(z.string())
    .describe('نقاط مهمة أخرى (أرقام، مواعيد، طلبات، روابط)'),
  triage: z
    .enum(['urgent', 'action', 'fyi', 'noise'])
    .describe('تصنيف سريع: عاجل / يحتاج إجراء / للاطلاع / ضوضاء'),
})

export type PersonalMailIntel = {
  summaryAr: string
  draftSubject: string
  draftBody: string
  extract: {
    dates: string[]
    times: string[]
    names: string[]
    important: string[]
  }
  triage: 'urgent' | 'action' | 'fyi' | 'noise'
  analyzedAt: string
  fallbackNoteAr?: string
}

function attachmentsNote(atts: GmailAttachmentMeta[]): string {
  if (!atts.length) return 'لا مرفقات.'
  return atts
    .map((a) => `- ${a.filename} (${a.mimeType}, ${a.size} بايت)`)
    .join('\n')
}

function fallbackIntel(msg: GmailMessageDetail): PersonalMailIntel {
  const draftSubject = msg.subject?.match(/^re:/i)
    ? msg.subject
    : `Re: ${msg.subject || 'بدون موضوع'}`
  return {
    summaryAr: (msg.snippet || msg.bodyText || 'رسالة بلا ملخص.').slice(0, 400),
    draftSubject,
    draftBody: [
      'السلام عليكم،',
      '',
      'شكراً لرسالتكم. سأرد بالتفصيل قريباً.',
      '',
      'مع التحية',
    ].join('\n'),
    extract: { dates: [], times: [], names: [], important: [] },
    triage: 'fyi',
    analyzedAt: new Date().toISOString(),
    fallbackNoteAr:
      'تعذّر تحليل الذكاء الاصطناعي — عُرضت مسودة افتراضية للمراجعة.',
  }
}

/**
 * AI summarize + draft reply for the caller's personal Gmail message.
 * Never writes to org IMAP tables.
 */
export async function analyzePersonalGmailMessage(
  userId: string,
  messageId: string,
  opts?: { accountEmail?: string | null }
): Promise<{
  ok: boolean
  message: GmailMessageDetail
  intel: PersonalMailIntel
  messageAr: string
}> {
  const message = await readGmailMessage(userId, messageId, {
    accountEmail: opts?.accountEmail,
  })

  const prompt = `حلّل رسالة البريد الشخصية التالية وجهّز مسودة رد.

من: ${message.from}
إلى: ${message.to}
الموضوع: ${message.subject}
التاريخ: ${message.date || '—'}

النص:
${(message.bodyText || message.snippet || '').slice(0, 18_000)}

المرفقات:
${attachmentsNote(message.attachments)}

قواعد:
- summaryAr: 2–4 جمل فصحى.
- draftBody: رد جاهز باسم صاحب البريد الشخصي (ليس باسم الجمعية)، مهذب ومختصر، دون اختلاق حقائق.
- إن كانت الرسالة إنجليزية يمكن الرد بالإنجليزية مع إبقاء summaryAr بالعربية.
- triage: urgent إن كان عاجلاً، action إن يحتاج رداً/عملاً، fyi للاطلاع، noise للترويج/الضوضاء.
- استخرج التواريخ والأوقات والأسماء بدقة من النص فقط.`

  try {
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug()),
      schema: analyzeSchema,
      system:
        'أنت مساعد بريد شخصي. تكتب بالعربية الفصحى المهنية وتستخرج كيانات بدقة دون اختلاق. لا تخلط بريد الجمعية مع البريد الشخصي.',
      prompt,
    })

    const intel: PersonalMailIntel = {
      summaryAr: object.summaryAr,
      draftSubject: object.draftSubject,
      draftBody: object.draftBody,
      extract: {
        dates: object.dates,
        times: object.times,
        names: object.names,
        important: object.important,
      },
      triage: object.triage,
      analyzedAt: new Date().toISOString(),
    }

    return {
      ok: true,
      message,
      intel,
      messageAr: 'تم تحليل الرسالة الشخصية وإعداد المسودة.',
    }
  } catch {
    return {
      ok: true,
      message,
      intel: fallbackIntel(message),
      messageAr: 'تحليل جزئي — راجع المسودة الافتراضية.',
    }
  }
}
