import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from 'ai'
import { getModel, UnknownModelError } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
/** Max duration for Netlify functions. */
export const maxDuration = 30

const MSA_SYSTEM_PROMPT = `أنت وكيل Arabic Buzz للمؤسسات السعودية.
- أجب دائماً بالعربية الفصحى المهنية (MSA).
- كن موجزاً وواضحاً، واذكر عدم اليقين عند غياب المصادر.
- لا تختلق أرقاماً قانونية أو ضريبية أو أرقام سجلات.
- عند عرض JSON أو أكواد، استخدم كتلاً تقنية واضحة دون خلطها بنص الواجهة.`

type ChatBody = {
  messages?: UIMessage[]
  prompt?: string
  message?: string
  modelId?: string
  modelSlug?: string
}

type StreamTextResult = ReturnType<typeof streamText>

/**
 * AI SDK v7 removed `toDataStreamResponse`; map it to `toUIMessageStreamResponse`
 * so Netlify routes can keep the documented call site.
 */
function withDataStreamResponse(result: StreamTextResult) {
  const netlifyHeaders = {
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  } as const

  return Object.assign(result, {
    toDataStreamResponse() {
      return result.toUIMessageStreamResponse({ headers: netlifyHeaders })
    },
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatBody
    const modelId =
      body.modelId ||
      body.modelSlug ||
      process.env.DEFAULT_HARNESS_MODEL ||
      'gemini-2.0-flash'

    const model = getModel(modelId)

    const hasMessages = Array.isArray(body.messages) && body.messages.length > 0
    const prompt = String(body.prompt || body.message || '').trim()

    if (!hasMessages && !prompt) {
      return Response.json(
        { error: 'أرسل messages أو prompt في جسم الطلب.' },
        { status: 400 }
      )
    }

    const result = withDataStreamResponse(
      streamText({
        model,
        system: MSA_SYSTEM_PROMPT,
        ...(hasMessages
          ? { messages: await convertToModelMessages(body.messages!) }
          : { prompt }),
        abortSignal: req.signal,
      })
    )

    // Real-time token streaming through Netlify CDN
    return result.toDataStreamResponse()
  } catch (e) {
    if (e instanceof UnknownModelError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'تعذّر بث الرد'
    return Response.json({ error: message }, { status: 500 })
  }
}
