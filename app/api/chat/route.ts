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
import {
  effortToRunParams,
  parseRunEffort,
} from '@/lib/ai/run-effort'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MSA_BASE = `أنت وكيل Arabic Buzz للمؤسسات السعودية.
- أجب دائماً بالعربية الفصحى المهنية (MSA).
- أنت مشارك في غرفة عمل مشتركة مع بشر ووكلاء — اللوحات (تقويم/مهام/ذاكرة/ملفات) ملك الغرفة وليست حساب شخص واحد.
- كن موجزاً وواضحاً، واذكر عدم اليقين عند غياب المصادر.
- لا تختلق أرقاماً قانونية أو ضريبية أو أرقام سجلات.
- المواعيد: المصدر الرسمي هو تقويم الغرفة المشترك — room_calendar_list / room_calendar_create / room_calendar_ingest (يدمج تواريخ عدة أشخاص) / room_calendar_reconcile (ترتيب حسب التاريخ ومن أضاف + تنبيه تعارض نفس الوقت). Google (calendar_*) اختياري فقط لدعوات خارجية/Zoom/مسح البريد.
- المهام والطلبات: لوحة الغرفة room_tasks_list / room_tasks_create / room_tasks_reconcile (يعيد الترتيب ويؤجّل المتأخر). لا تعتمد على قائمة محلية لشخص واحد.
- الذاكرة المشتركة: room_memory_list / room_memory_add للغرفة كلها.
- مصادر الملفات:
  أ) ملف مرفوع من جهاز المستخدم إلى الغرفة (سحابة الغرفة / خزنة) — list_workspace_files / fileId المرفق في الرسالة. الرفع يزامن تلقائياً مع عقل الشركة (Drive) عند ربط Google.
  ب) مرفق ظاهر في الشات أو المعاينة — استخدم fileId مباشرة.
  ج) عقل الشركة = Google Drive (إلزامي للمعرفة المشتركة): search_knowledge_base أو brain_open_document → عدّل → brain_save_document.
  اعمل على ملف الغرفة أولاً إن وُجد؛ ثم احفظ إلى Drive عبر brain_save_document عند الحاجة.
- عند إرفاق ملف أو ذكر fileId أو طلب «عدّل / غيّر / صحّح / استبدل» — نفّذ الأدوات فوراً وأعد نسخة قابلة للتنزيل. ممنوع الاكتفاء بوصف التعديل دون ملف.
- حلقة العمل الإلزامية للملفات:
  1) Word موجود: read_document → edit_document(replacements=[{find,replace}]) للحفاظ على التنسيق/الصور، أو templateData لـ {placeholders}. إعادة بناء كاملة فقط عند الحاجة: body/paragraphs.
  2) PDF/نص: read_document → edit_document (format=pdf|txt…) أو pdf_*. أو return_file إن لم يتغيّر المحتوى.
  3) Excel (خلايا مع الحفاظ على البنية): read_excel → edit_excel(cells) → تنزيل.
  4) Excel كامل كجداول جديدة: edit_document(format=xlsx, sheets=…).
  5) PowerPoint موجود: edit_document(replacements=…) للحفاظ على التصميم؛ أو slides=[…] لإعادة بناء نصية (وضّح ذلك للمستخدم).
  6) صور: edit_image أو generate_image_edit ثم تنزيل في الشات.
  7) PDF متقدم: pdf_create / pdf_stamp / pdf_merge / pdf_fill_form. تحويل الصيغ: convert_document / convert_file (الأفضل مجاناً: Google Drive إن مربوط؛ ثم CloudConvert إن وُجد المفتاح؛ ثم إعادة بناء نصية pdf↔docx).
  8) صورة/PDF ممسوح + «اقرأ/ابحث»: arabic_ocr. قرارات طويلة: read_decision_document.
  9) إنشاء من الصفر: edit_document بدون fileId. إعادة إرسال: return_file. حذف من الغرفة: delete_file.
  10) عقل الشركة (Drive): brain_open_document → عدّل → brain_save_document. تعبئة تدقيق: fill_policy_audit.
  11) لتيليجرام/بريد: send_file.
- بحث اللوائح على الويب: web_search ثم web_fetch / ingest_url_to_brain.
- تقارير أعضاء/حضور: report_room_attendance. بوابات حكومية: browser_rpa. متصفح/سطح مكتب عبر Cua: cua_computer عند اتصال CUA_BRIDGE_URL فقط.
- بريد Google: gmail_search ثم gmail_read. الإرسال: gmail_send (HITL). جداول: sheets_read / sheets_write (الكتابة HITL).
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
    preferredEffort?: string
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
  /** Files attached from device / preview (not Drive-only). */
  attachedFiles?: {
    fileId: string
    name?: string
    mimeType?: string
  }[]
  /** Power / effort: LOW | MEDIUM | HIGH | MAX */
  effort?: string
  effortLevel?: string
  maxSteps?: number
  temperature?: number
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
    const mem =
      clientMemory && clientMemory.length
        ? `\nذاكرة المساحة:\n${clientMemory.map((m) => `• ${m}`).join('\n')}`
        : ''
    const nameAr = scope?.nameAr || scopeId
    return `\n\nأنت في مساحة العمل «${nameAr}». ابنِ على سياق الغرفة. ملفات الغرفة متاحة بـ list_workspace_files حتى لو لم تكن من Drive.${mem}`
  }
}

function attachedFilesBlock(
  files?: { fileId: string; name?: string; mimeType?: string }[]
): string {
  if (!files?.length) return ''
  const lines = files
    .filter((f) => f?.fileId)
    .map((f) => {
      const name = f.name || f.fileId
      const mime = f.mimeType ? ` (${f.mimeType})` : ''
      return `• «${name}»${mime} — fileId=${f.fileId}`
    })
  if (!lines.length) return ''
  return `

ملفات مرفقة من جهاز المستخدم / معاينة الغرفة (ليست بالضرورة من Drive):
${lines.join('\n')}
أمر إلزامي: اقرأ وعدّل هذه الملفات بالأدوات المناسبة (read_document / edit_document / read_excel / edit_excel / edit_image / convert_document / pdf_* حسب النوع) ثم أظهر النتيجة بزر تنزيل عبر edit_* أو return_file. لا تكتفِ بالوصف.`
}

export async function POST(req: Request) {
  try {
    const { warmProviderKeyCache } = await import('@/lib/ai/provider-key-store')
    await warmProviderKeyCache()

    const auth = await requireRealUser(req)
    if (!auth.ok) return auth.response

    const body = (await req.json()) as ChatBody
    const profile = body.agentProfile
    // Client sends seat preferredModel as modelId when set; profile is fallback.
    const modelId =
      body.modelId ||
      body.modelSlug ||
      profile?.preferredModel ||
      process.env.DEFAULT_HARNESS_MODEL ||
      'gemini-3.1-pro'

    const model = getModel(modelId)
    const scopeId = body.scopeId || 'shared-demo'
    const { assertRoomCanPost } = await import('@/lib/rooms/persist')
    const roomGate = await assertRoomCanPost(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!roomGate.ok) {
      return Response.json({ error: roomGate.error }, { status: 403 })
    }
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
            preferredEffort: profile.preferredEffort as
              | 'LOW'
              | 'MEDIUM'
              | 'HIGH'
              | 'MAX'
              | undefined,
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
    const attachBlock = attachedFilesBlock(body.attachedFiles)
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
      attachBlock +
      postureBlock +
      (roomAgents
        ? `\n\nوكلاء الغرفة المتاحون للإشارة بـ @slug:\n${roomAgents}`
        : '')

    // When files are attached, nudge the user prompt so the model must act.
    const promptWithFiles =
      !hasMessages && attachBlock && prompt
        ? `${prompt}\n\n[مرفق: عدّل الملف/الملفات المرفقة وأعد نسخة قابلة للتنزيل في الشات.]`
        : prompt

    const persistAgent = body.persist !== false
    const enableTools = body.enableTools !== false
    const effort = parseRunEffort(body.effortLevel || body.effort)
    const effortParams = effortToRunParams(effort)
    const baseMaxSteps =
      typeof body.maxSteps === 'number' &&
      Number.isFinite(body.maxSteps) &&
      body.maxSteps > 0
        ? Math.min(16, Math.round(body.maxSteps))
        : effortParams.maxSteps
    // Extra tool steps when the user attached a file so edit→return can finish.
    const maxSteps = Math.min(
      16,
      baseMaxSteps + (body.attachedFiles?.length ? 3 : 0)
    )
    const temperature =
      typeof body.temperature === 'number' &&
      Number.isFinite(body.temperature)
        ? Math.min(1.2, Math.max(0, body.temperature))
        : effortParams.temperature
    const systemWithEffort = `${system}\n\n${effortParams.systemHintAr}`

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
        system: systemWithEffort,
        temperature,
        ...(hasMessages
          ? { messages: await convertToModelMessages(body.messages!) }
          : { prompt: promptWithFiles }),
        ...(tools ? { tools, stopWhen: stepCountIs(maxSteps) } : {}),
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
