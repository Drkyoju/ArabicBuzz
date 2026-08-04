import {
  convertToModelMessages,
  streamText,
  stepCountIs,
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
import {
  parsePosture,
  POSTURE_LABELS_AR,
  type SecurityPostureMode,
} from '@/lib/security/posture'
import { getNativeAiTools } from '@/lib/agents/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MSA_BASE = `أنت وكيل Arabic Buzz للمؤسسات السعودية.
- أجب دائماً بالعربية الفصحى المهنية (MSA).
- أنت مشارك في غرفة عمل مع بشر ووكلاء آخرين — لا تتصرف كمساعد منعزل.
- كن موجزاً وواضحاً، واذكر عدم اليقين عند غياب المصادر.
- لا تختلق أرقاماً قانونية أو ضريبية أو أرقام سجلات.
- المواعيد والاجتماعات: قسم «التقويم · Zoom» في الشريط. تقويم الجمعية: حساب Google واحد مربوط + قائمة بريد ضيوف بدون OAuth. لعرض الكل: calendar_list_events؛ لأوقات تناسب الجميع مع ضيوف: calendar_find_alignment مع guestEmails؛ للإنشاء مع دعوات وZoom: calendar_create_event (conferenceUrl/zoomUrl + attendeeEmails). امسح Zoom من البريد بـ calendar_scan_email. الأوقات Asia/Riyadh وISO-8601. لا تخترع eventId.
- عقل الشركة من Drive: إذا طلب تحديث المعرفة من مجلد Google Drive أو «ملفات الجمعية»، استخدم drive_sync_brain ثم search_knowledge_base.
- تعديل المستندات: إذا طلب المستخدم تعديل Word/Excel/PowerPoint/نص مرفوع أو إنشاء ملف للتنزيل: 1) list_workspace_files أو list_files 2) read_document/read_file لاستخراج المحتوى 3) طبّق التعديلات ثم edit_document بالمحتوى الكامل المعدّل (body/paragraphs أو sheets أو slides) وformat المناسب. افتراضياً أنشئ نسخة جديدة (replaceSource=false) واذكر اسم الملف ومعرّفه. لا تختلق محتوى الملف دون قراءته أولاً إن وُجد مصدر.`

type ChatBody = {
  messages?: UIMessage[]
  prompt?: string
  message?: string
  modelId?: string
  modelSlug?: string
  scopeId?: string
  agentId?: string
  /** Custom / roster agent profile from the client (overrides built-ins). */
  agentProfile?: {
    id: string
    nameAr: string
    slug: string
    systemPromptAr: string
    taskAr?: string
    preferredModel?: string
  }
  /** Notes from peer agents in collaborative mode. */
  peerContextAr?: string
  collabMode?: 'solo' | 'team'
  persist?: boolean
  authorNameAr?: string
  securityPosture?: SecurityPostureMode | string
  enableTools?: boolean
  /** Client-side scope memories for tools + prompt */
  scopeMemory?: string[]
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

function scopeSystemBlock(
  userId: string,
  scopeId?: string,
  clientMemory?: string[]
): string {
  if (!scopeId) return ''
  try {
    const ctx = resolveActiveScope({
      userId,
      scopeId,
      scopes: DEMO_SCOPES,
    })
    if (clientMemory && clientMemory.length) {
      ctx.memory = clientMemory
    }
    return `\n\n${buildPromptContext(ctx)}`
  } catch {
    const scope = DEMO_SCOPES.find((s) => s.id === scopeId)
    if (!scope) return ''
    const mem =
      clientMemory && clientMemory.length
        ? `\nذاكرة المساحة:\n${clientMemory.map((m) => `• ${m}`).join('\n')}`
        : ''
    return `\n\nأنت في مساحة العمل «${scope.nameAr}». ابنِ على سياق الغرفة.${mem}`
  }
}

export async function POST(req: Request) {
  try {
    const { warmProviderKeyCache } = await import('@/lib/ai/provider-key-store')
    await warmProviderKeyCache()

    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const body = (await req.json()) as ChatBody
    const profile = body.agentProfile
    const modelId =
      profile?.preferredModel ||
      body.modelId ||
      body.modelSlug ||
      process.env.DEFAULT_HARNESS_MODEL ||
      'gemini-2.5-pro'

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
      (profile?.id && profile.nameAr && profile.systemPromptAr
        ? {
            id: profile.id,
            nameAr: profile.nameAr,
            slug: profile.slug || profile.id,
            systemPromptAr: profile.systemPromptAr,
            taskAr: profile.taskAr,
            preferredModel: profile.preferredModel,
            avatarHue: 160,
          }
        : null) ||
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

    const taskBlock =
      mentioned && 'taskAr' in mentioned && mentioned.taskAr
        ? `\nالمهمة المعيّنة: ${mentioned.taskAr}`
        : profile?.taskAr
          ? `\nالمهمة المعيّنة: ${profile.taskAr}`
          : ''

    const peerBlock = body.peerContextAr?.trim()
      ? `\n\nملاحظات زملائك الوكلاء في هذه الجولة (تعاون):\n${body.peerContextAr.trim()}\nكمّل عملهم أو صحّحه دون تكرار عديم الفائدة.`
      : ''

    const collabBlock =
      body.collabMode === 'team'
        ? '\n\nأنت في وضع تعاون جماعي: الغرفة مشتركة، اطّلع على سياق الزملاء وساعدهم.'
        : ''

    const agentBlock = mentioned
      ? `\n\nهويتك في الغرفة: «${mentioned.nameAr}» (${mentioned.slug}).${taskBlock}\n${mentioned.systemPromptAr}${peerBlock}${collabBlock}`
      : ''

    const scopeBlock = scopeSystemBlock(
      auth.user.id,
      scopeId,
      body.scopeMemory
    )
    const roomAgents = agentsForScope(scopeId)
      .map((a) => `• ${a.nameAr} (@${a.slug})`)
      .join('\n')

    const posture = parsePosture(
      body.securityPosture || process.env.DEFAULT_SECURITY_POSTURE
    )
    const postureBlock = `\n\nوضع الأمان الحالي: ${posture} — ${POSTURE_LABELS_AR[posture]}. التزم بحدود الأدوات حسب هذا الوضع.`

    const system =
      MSA_BASE +
      agentBlock +
      scopeBlock +
      postureBlock +
      (roomAgents
        ? `\n\nوكلاء الغرفة المتاحون للإشارة بـ @slug:\n${roomAgents}`
        : '')

    const persistAgent = body.persist !== false
    const enableTools = body.enableTools !== false
    const tools = enableTools
      ? getNativeAiTools({
          mode: posture,
          requesterId: auth.user.id,
          scopeId,
          scopeMemory: body.scopeMemory,
        })
      : undefined

    const result = withDataStreamResponse(
      streamText({
        model,
        system,
        ...(hasMessages
          ? { messages: await convertToModelMessages(body.messages!) }
          : { prompt }),
        ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
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
