import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type ToolSet,
  type UIMessage,
} from 'ai'
import { getModel, UnknownModelError } from '@/lib/ai/providers'
import { requireRealUser } from '@/lib/auth/session'
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
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { scheduleOtelFlush } from '@/lib/observability/langfuse'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MSA_BASE = `أنت وكيل Arabic Buzz للمؤسسات السعودية.
- أجب دائماً بالعربية الفصحى المهنية (MSA).
- أنت مشارك في غرفة عمل مشتركة مع بشر ووكلاء — اللوحات (تقويم/مهام/ذاكرة/ملفات) ملك الغرفة وليست حساب شخص واحد.
- كن موجزاً وواضحاً، واذكر عدم اليقين عند غياب المصادر.
- لا تختلق أرقاماً قانونية أو ضريبية أو أرقام سجلات.
- المواعيد: المصدر الرسمي هو تقويم الغرفة المشترك — room_calendar_list / room_calendar_create / room_calendar_ingest (يدمج تواريخ عدة أشخاص ويعدّل التعارضات). Google (calendar_*) اختياري فقط لدعوات خارجية/Zoom/مسح البريد.
- المهام والطلبات: لوحة الغرفة room_tasks_list / room_tasks_create / room_tasks_reconcile (يعيد الترتيب ويؤجّل المتأخر). لا تعتمد على قائمة محلية لشخص واحد.
- الذاكرة المشتركة: room_memory_list / room_memory_add للغرفة كلها.
- عقل الشركة = ملفات Google Drive. بحث: search_knowledge_base. فتح/تعديل ملف من العقل: brain_open_document → read/edit → brain_save_document (يعيد الملف لـ Drive ويفهرسه). زامن المجلد بـ drive_sync_brain عند الحاجة.
- الملفات في الشات (إنشاء / تعديل / تحويل / تنزيل):
  1) إنشاء ملف جديد بطلب المستخدم فقط: edit_document بدون fileId (format=docx|pdf|xlsx…) مع body أو paragraphs — يظهر زر تنزيل تلقائياً.
  2) تعديل ملف مرفوع في الغرفة: list_workspace_files → read_document → edit_document.
  3) تعديل ملف داخل العقل (Drive): brain_open_document(name) → edit_document → brain_save_document(fileId, driveFileId).
  4) تحويل PDF↔Word مع الحفاظ على النص العربي: convert_document (toFormat=docx أو pdf). أخبر المستخدم أن التخطيط/الصور لا تُنسخ حرفياً لكن النص العربي يبقى.
  5) تعبئة نماذج تدقيق Excel من العقل: fill_policy_audit(topicAr) — يُرجع ملف معبّأ للمراجعة البشرية.
  6) أعد الملف في الشات دائماً (attachments). لتيليجرام/بريد: send_file. ملخص المدير الأسبوعي: send_director_digest.
- بحث اللوائح على الويب: web_search (Brave إن وُجد BRAVE_API_KEY) ثم web_fetch لصفحة محددة.
- أدوات PDF إضافية: pdf_create / pdf_stamp / pdf_merge / pdf_list_fields / pdf_fill_form.
- تقارير أعضاء/حضور: report_room_attendance. بوابات حكومية: browser_rpa (HITL عبر browser-use/ماك).
- بريد Google: gmail_search ثم gmail_read (قراءة فقط). جداول: sheets_read / sheets_write (الكتابة HITL).
- عند إنتاج مسودة للمستند أو كود طويل للوحة المخرجات، غلّفه بوسم واحد:
  <artifact type="markdown|code|json|diff|html" title="عنوان عربي">المحتوى</artifact>`

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

/**
 * Same MCP wiring as `runAgentEngine` so web chat sees the connected servers.
 * Tool execution still routes through the HITL/RBAC interceptor in the engine
 * for native tools; MCP tools remain bounded by the connected server's scope.
 */
async function loadMcpTools(): Promise<ToolSet> {
  try {
    await connectEnvMcpServers()
    return await getMCPHostManager().getCombinedToolSet()
  } catch (e) {
    console.warn(
      '[chat] MCP tools unavailable:',
      e instanceof Error ? e.message : e
    )
    return {}
  }
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

    const auth = await requireRealUser(req)
    if (!auth.ok) return auth.response

    const body = (await req.json()) as ChatBody
    const profile = body.agentProfile
    const modelId =
      profile?.preferredModel ||
      body.modelId ||
      body.modelSlug ||
      process.env.DEFAULT_HARNESS_MODEL ||
      'gemini-3.1-pro'

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
    if (rawPrompt.length > 40_000) {
      return Response.json(
        { error: 'النص طويل جداً (حد ٤٠ ألف حرف).' },
        { status: 400 }
      )
    }
    if (hasMessages) {
      const total = (body.messages || [])
        .map((m) => String((m as { content?: string }).content || ''))
        .join('').length
      if (total > 120_000) {
        return Response.json(
          { error: 'سجل المحادثة طويل جداً.' },
          { status: 400 }
        )
      }
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
      ? {
          ...getNativeAiTools({
            mode: posture,
            requesterId: auth.user.id,
            scopeId,
            scopeMemory: body.scopeMemory,
          }),
          ...(await loadMcpTools()),
        }
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

    // Netlify/serverless: flush OTel → Langfuse after the response streams.
    scheduleOtelFlush()
    return result.toDataStreamResponse()
  } catch (e) {
    if (e instanceof UnknownModelError) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'تعذّر بث الرد'
    return Response.json({ error: message }, { status: 500 })
  }
}
