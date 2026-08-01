import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from 'ai'
import { getModel, UnknownModelError } from '@/lib/ai/providers'
import { requireUser } from '@/lib/auth/session'
import {
  DEMO_SCOPES,
  buildPromptContext,
  resolveActiveScope,
} from '@/lib/scopes/manager'
import {
  agentsForScope,
  resolveMentionHandoff,
  ROOM_AGENTS,
} from '@/lib/rooms/agents'
import { insertRoomPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MSA_BASE = `أنت وكيل Arabic Buzz للمؤسسات السعودية.
- أجب دائماً بالعربية الفصحى المهنية (MSA).
- أنت مشارك في غرفة عمل مع بشر ووكلاء آخرين — لا تتصرف كمساعد منعزل.
- كن موجزاً وواضحاً، واذكر عدم اليقين عند غياب المصادر.
- لا تختلق أرقاماً قانونية أو ضريبية أو أرقام سجلات.`

type ChatBody = {
  messages?: UIMessage[]
  prompt?: string
  message?: string
  modelId?: string
  modelSlug?: string
  scopeId?: string
  agentId?: string
  persist?: boolean
  authorNameAr?: string
}

type StreamTextResult = ReturnType<typeof streamText>

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

function scopeSystemBlock(userId: string, scopeId?: string): string {
  if (!scopeId) return ''
  try {
    const ctx = resolveActiveScope({
      userId,
      scopeId,
      scopes: DEMO_SCOPES,
    })
    return `\n\n${buildPromptContext(ctx)}`
  } catch {
    const scope = DEMO_SCOPES.find((s) => s.id === scopeId)
    if (!scope) return ''
    return `\n\nأنت في مساحة العمل «${scope.nameAr}». ابنِ على سياق الغرفة.`
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const body = (await req.json()) as ChatBody
    const modelId =
      body.modelId ||
      body.modelSlug ||
      process.env.DEFAULT_HARNESS_MODEL ||
      'gemini-2.0-flash'

    const model = getModel(modelId)
    const scopeId = body.scopeId || 'shared-demo'
    const rawPrompt = String(body.prompt || body.message || '').trim()
    const hasMessages = Array.isArray(body.messages) && body.messages.length > 0

    if (!hasMessages && !rawPrompt) {
      return Response.json(
        { error: 'أرسل messages أو prompt في جسم الطلب.' },
        { status: 400 }
      )
    }

    const handoff = resolveMentionHandoff(rawPrompt || '')
    const mentioned =
      (body.agentId && ROOM_AGENTS.find((a) => a.id === body.agentId)) ||
      handoff.agent ||
      agentsForScope(scopeId)[0] ||
      null

    const prompt = hasMessages ? '' : handoff.cleanPrompt || rawPrompt

    if (body.persist === true && prompt) {
      const humanName =
        body.authorNameAr ||
        auth.user.user_metadata?.full_name ||
        auth.user.email ||
        'مستخدم'
      await insertRoomPost({
        scopeId,
        authorKind: 'human',
        authorId: auth.user.id,
        authorNameAr: String(humanName),
        content: rawPrompt,
        mentionAgentId: mentioned?.id,
      })
    }

    const agentBlock = mentioned
      ? `\n\nهويتك في الغرفة: «${mentioned.nameAr}» (${mentioned.slug}).\n${mentioned.systemPromptAr}`
      : ''

    const scopeBlock = scopeSystemBlock(auth.user.id, scopeId)
    const roomAgents = agentsForScope(scopeId)
      .map((a) => `• ${a.nameAr} (@${a.slug})`)
      .join('\n')

    const system =
      MSA_BASE +
      agentBlock +
      scopeBlock +
      (roomAgents
        ? `\n\nوكلاء الغرفة المتاحون للإشارة بـ @slug:\n${roomAgents}`
        : '')

    const persistAgent = body.persist !== false

    const result = withDataStreamResponse(
      streamText({
        model,
        system,
        ...(hasMessages
          ? { messages: await convertToModelMessages(body.messages!) }
          : { prompt }),
        abortSignal: req.signal,
        onFinish: async ({ text }) => {
          if (!persistAgent || !text) return
          await insertRoomPost({
            scopeId,
            authorKind: 'agent',
            authorId: mentioned?.id || 'agent-desk',
            authorNameAr: mentioned?.nameAr || 'وكيل الغرفة',
            content: text,
            mentionAgentId: mentioned?.id,
          })
        },
      })
    )

    return result.toDataStreamResponse()
  } catch (e) {
    if (e instanceof UnknownModelError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'تعذّر بث الرد'
    return Response.json({ error: message }, { status: 500 })
  }
}
