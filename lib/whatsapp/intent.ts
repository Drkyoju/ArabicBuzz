import { generateObject } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'

export const WhatsAppIntentKind = z.enum([
  'task',
  'order',
  'confirmation',
  'question',
  'other',
])

export type WhatsAppIntentKind = z.infer<typeof WhatsAppIntentKind>

export type WhatsAppIntent = {
  kind: WhatsAppIntentKind
  summaryAr: string
  needsOwner: boolean
  urgency: 'low' | 'normal' | 'high'
}

const intentSchema = z.object({
  kind: WhatsAppIntentKind,
  summaryAr: z.string().describe('ملخص قصير بالعربية الفصحى'),
  needsOwner: z
    .boolean()
    .describe('هل يحتاج قراراً من مالك الحساب قبل المتابعة؟'),
  urgency: z.enum(['low', 'normal', 'high']),
})

/**
 * Classify an inbound WhatsApp message (text or transcript).
 */
export async function classifyWhatsAppIntent(
  messageAr: string
): Promise<WhatsAppIntent> {
  const modelSlug =
    process.env.DEFAULT_HARNESS_MODEL || 'gemini-3.1-pro'
  try {
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug),
      schema: intentSchema,
      system: `صنّف رسالة واتساب واردة لمساعد أعمال عربي.
- task: طلب تنفيذ عمل أو بحث أو جدولة أو إعداد شيء
- order: أمر/توجيه واضح للتنفيذ
- confirmation: تأكيد أو موافقة أو رفض لشيء سابق
- question: سؤال معلوماتي فقط
- other: تحية أو دردشة أو غير واضح
needsOwner=true إذا كان القرار حساساً أو ناقص بيانات لا يملكها الوكيل.`,
      prompt: messageAr.slice(0, 4000),
    })
    return object
  } catch {
    return {
      kind: 'other',
      summaryAr: messageAr.slice(0, 120),
      needsOwner: true,
      urgency: 'normal',
    }
  }
}

const outcomeSchema = z.object({
  status: z.enum(['done', 'needs_owner', 'needs_requester']),
  messageArToRequester: z
    .string()
    .describe('ما يُرسل لمراسل واتساب (مختصر، مهني)'),
  messageArToOwner: z
    .string()
    .describe('ما يُعرض لصاحب الحساب في Arabic Buzz'),
})

export type WhatsAppOutcome = z.infer<typeof outcomeSchema>

/** Decide if the agent finished or still needs the owner / requester. */
export async function classifyWhatsAppOutcome(opts: {
  originalMessageAr: string
  agentTextAr: string
  intent: WhatsAppIntent
}): Promise<WhatsAppOutcome> {
  const modelSlug =
    process.env.DEFAULT_HARNESS_MODEL || 'gemini-3.1-pro'
  try {
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug),
      schema: outcomeSchema,
      system: `قيّم مخرجات وكيل يعمل على رسالة واتساب نيابة عن مالك الحساب.
- done: اكتمل الرد/المهمة بما يكفي لإبلاغ المرسل
- needs_owner: ينقص قرار أو معلومة من المالك فقط
- needs_requester: ينقص توضيح من مرسل واتساب
اكتب رسائل قصيرة بالعربية الفصحى.`,
      prompt: `النية: ${opts.intent.kind} — ${opts.intent.summaryAr}
الرسالة الأصلية:
${opts.originalMessageAr.slice(0, 2000)}

رد الوكيل:
${opts.agentTextAr.slice(0, 3000)}`,
    })
    return object
  } catch {
    return {
      status: 'done',
      messageArToRequester: opts.agentTextAr.slice(0, 900) || 'تم استلام رسالتك.',
      messageArToOwner: `اكتملت معالجة رسالة واتساب: ${opts.intent.summaryAr}`,
    }
  }
}
