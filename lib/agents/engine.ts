import { generateText, stepCountIs, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { getToolExecutor, toolRegistry } from '@/lib/agents/tools'
import { searchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import { interceptToolExecution } from '@/lib/agents/interceptor'
import type { SecurityPostureMode } from '@/lib/security/posture'

/** Local stub tools exposed as Vercel AI SDK schemas. */
export function getNativeAiTools(opts?: {
  mode?: SecurityPostureMode
  requesterId?: string
  scopeId?: string
  scopeMemory?: string[]
}): ToolSet {
  const mode = opts?.mode || 'AUTO'
  const requesterId = opts?.requesterId || 'engine'
  const scopeId = opts?.scopeId
  const scopeMemory = opts?.scopeMemory

  const native: ToolSet = {
    web_search: tool({
      description: 'بحث ويب عربي/إنجليزي عن استعلام.',
      inputSchema: z.object({
        query: z.string().describe('نص البحث'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'web_search',
          params,
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('web_search'),
        }),
    }),
    web_fetch: tool({
      description: 'جلب محتوى صفحة ويب عبر URL.',
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'web_fetch',
          params,
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('web_fetch'),
        }),
    }),
    read_file: tool({
      description:
        'قراءة ملف من مساحة العمل (Word/Excel/PowerPoint/PDF/نص) واستخراج نصه. مرّر fileId أو اسم الملف.',
      inputSchema: z.object({
        path: z.string().optional().describe('معرّف الملف أو اسمه'),
        fileId: z.string().optional(),
        name: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'read_file',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('read_file'),
        }),
    }),
    list_files: tool({
      description: 'سرد ملفات مساحة العمل المرفوعة (قسم الملفات).',
      inputSchema: z.object({}),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'list_files',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('list_files'),
        }),
    }),
    list_workspace_files: tool({
      description: 'سرد ملفات الغرفة الجاهزة للتعديل (docx/xlsx/pptx…).',
      inputSchema: z.object({}),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'list_workspace_files',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('list_workspace_files'),
        }),
    }),
    read_document: tool({
      description:
        'استخراج نص مستند مكتبي مرفوع (Word، Excel، PowerPoint، PDF) قبل تعديله.',
      inputSchema: z.object({
        fileId: z.string().describe('معرّف الملف أو اسمه كما في list_workspace_files'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'read_document',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('read_document'),
        }),
    }),
    edit_document: tool({
      description:
        'إنشاء أو استبدال ملف مكتبي بعد التعديل (Word/Excel/PowerPoint/نص) ليعيده المستخدم بالتنزيل. اقرأ الملف أولاً، طبّق طلب المستخدم، ثم مرّر المحتوى الكامل المعدّل.',
      inputSchema: z.object({
        fileId: z
          .string()
          .optional()
          .describe('الملف المصدر (اختياري إن أنشأت ملفاً جديداً)'),
        outputName: z
          .string()
          .optional()
          .describe('اسم الملف الناتج مثل تقرير-معدّل.docx'),
        format: z
          .enum(['docx', 'xlsx', 'pptx', 'txt', 'md', 'csv'])
          .describe('صيغة الملف الناتج'),
        title: z.string().optional(),
        body: z
          .string()
          .optional()
          .describe('نص Word/Markdown الكامل بعد التعديل'),
        paragraphs: z.array(z.string()).optional(),
        sheets: z
          .array(
            z.object({
              name: z.string().optional(),
              rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
            })
          )
          .optional()
          .describe('جداول Excel: كل صف مصفوفة خلايا'),
        slides: z
          .array(
            z.object({
              title: z.string(),
              bullets: z.array(z.string()).optional(),
              notes: z.string().optional(),
            })
          )
          .optional()
          .describe('شرائح PowerPoint'),
        replaceSource: z
          .boolean()
          .optional()
          .describe('true لاستبدال الملف الأصلي (يحتاج موافقة HITL)'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'edit_document',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('edit_document'),
        }),
    }),
    memory_search: tool({
      description: 'بحث في ذاكرة النطاق.',
      inputSchema: z.object({
        query: z.string(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'memory_search',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            scopeMemory,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('memory_search'),
        }),
    }),
    query_db_readonly: tool({
      description: 'استعلام قاعدة بيانات للقراءة فقط.',
      inputSchema: z.object({
        sql: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'query_db_readonly',
          params,
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('query_db_readonly'),
        }),
    }),
    search_knowledge_base: tool({
      description:
        'بحث هجين في قاعدة معرفة الشركة للنطاق الحالي (عقل الشركة).',
      inputSchema: z.object({
        queryAr: z.string().min(1).describe('استعلام البحث بالعربية'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'search_knowledge_base',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: async (_name, p) =>
            searchKnowledgeBase({
              queryAr: String(p.queryAr || ''),
              scopeId: String(p.scopeId || scopeId || 'shared-demo'),
            }),
        }),
    }),
    calendar_list_events: tool({
      description:
        'عرض المواعيد القادمة من كل حسابات Google المربوطة (أو بريد محدد). كل موعد يحمل accountEmail.',
      inputSchema: z.object({
        query: z.string().optional().describe('بحث اختياري في العنوان'),
        maxResults: z.number().optional(),
        emails: z
          .array(z.string())
          .optional()
          .describe('تصفية حسب بريد واحد أو أكثر'),
        email: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_list_events',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_list_events'),
        }),
    }),
    calendar_find_alignment: tool({
      description:
        'إيجاد أوقات تناسب الجميع: تقاويم Google المربوطة + ضيوف ببريدهم فقط (guestEmails) دون تسجيل دخول. بعد الاختيار أنشئ الموعد بدعوات.',
      inputSchema: z.object({
        emails: z
          .array(z.string())
          .optional()
          .describe('الحسابات المربوطة للمقارنة — افتراضي كل المربوطة'),
        guestEmails: z
          .array(z.string())
          .optional()
          .describe('بريد الأصدقاء/الموظفين بدون OAuth'),
        attendeeEmails: z.array(z.string()).optional(),
        durationMinutes: z.number().optional().describe('مدة الاجتماع بالدقائق'),
        timeMinIso: z.string().optional(),
        timeMaxIso: z.string().optional(),
        timeZone: z.string().optional(),
        workdayStartHour: z.number().optional(),
        workdayEndHour: z.number().optional(),
        maxSlots: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_find_alignment',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_find_alignment'),
        }),
    }),
    calendar_scan_email: tool({
      description:
        'مسح بريد Gmail لدعوات الاجتماع وZoom/Meet ثم اقتراح إضافتها للتقويم. إن وُجدت بيانات Zoom S2S على الخادم يمكن إنشاء رابط Zoom تلقائياً عند calendar_create_event بدون conferenceUrl.',
      inputSchema: z.object({
        maxResults: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_scan_email',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_scan_email'),
        }),
    }),
    calendar_find_duplicates: tool({
      description:
        'كشف المواعيد المكررة أو المتعارضة في تقويم Google (نفس الوقت، نفس العنوان، تداخل زمني، نفس رابط Zoom).',
      inputSchema: z.object({
        maxResults: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_find_duplicates',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_find_duplicates'),
        }),
    }),
    calendar_create_event: tool({
      description:
        'إضافة موعد إلى تقويم Google مع تذكيرات بريد/منبثقة وروابط Zoom عند توفرها. يتوقف إن وُجد تكرار/تعارض ما لم يُمرَّر allowDuplicate=true.',
      inputSchema: z.object({
        summary: z.string().describe('عنوان الموعد'),
        startIso: z.string().describe('بداية ISO-8601 مع المنطقة إن أمكن'),
        endIso: z.string().describe('نهاية ISO-8601'),
        description: z.string().optional(),
        location: z.string().optional(),
        conferenceUrl: z.string().optional().describe('رابط Zoom أو Meet'),
        zoomUrl: z.string().optional(),
        timeZone: z.string().optional().describe('افتراضي Asia/Riyadh'),
        reminderMinutes: z
          .array(z.number())
          .optional()
          .describe('دقائق قبل الموعد للتذكير'),
        attendeeEmails: z.array(z.string()).optional(),
        accountEmail: z
          .string()
          .optional()
          .describe('أي بريد مربوط يُنشأ عليه الموعد'),
        email: z.string().optional(),
        allowDuplicate: z
          .boolean()
          .optional()
          .describe('اسمح بالإضافة رغم تعارض محتمل'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_create_event',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_create_event'),
        }),
    }),
    calendar_update_event: tool({
      description: 'تعديل موعد موجود في تقويم Google عبر eventId.',
      inputSchema: z.object({
        eventId: z.string(),
        summary: z.string().optional(),
        startIso: z.string().optional(),
        endIso: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        conferenceUrl: z.string().optional(),
        timeZone: z.string().optional(),
        reminderMinutes: z.array(z.number()).optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_update_event',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_update_event'),
        }),
    }),
    calendar_delete_event: tool({
      description: 'حذف موعد من تقويم Google عبر eventId.',
      inputSchema: z.object({
        eventId: z.string(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'calendar_delete_event',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('calendar_delete_event'),
        }),
    }),
    drive_sync_brain: tool({
      description:
        'مزامنة مجلد Google Drive (ملفات الجمعية / عقل الشركة) إلى قاعدة المعرفة. استخدمه عندما يطلب المستخدم تحديث المعرفة من Drive.',
      inputSchema: z.object({
        folderId: z
          .string()
          .optional()
          .describe('معرّف المجلد — افتراضي ملفات الجمعية'),
        maxFiles: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'drive_sync_brain',
          params: {
            ...params,
            userId: requesterId,
            scopeId: scopeId || 'shared-demo',
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('drive_sync_brain'),
        }),
    }),
  }

  // Ensure registry stays the source of truth for known local names
  void toolRegistry
  return native
}

export type AgentEngineInput = {
  prompt: string
  system?: string
  modelSlug?: string
  scopeId?: string
  mode?: SecurityPostureMode
  requesterId?: string
  /** When false, skip MCP tool binding (local stubs only). Default true. */
  includeMcpTools?: boolean
  maxSteps?: number
}

export type AgentEngineResult = {
  text: string
  modelSlug: string
  toolNames: string[]
  steps: number
}

/**
 * Agent orchestrator entry: binds native local tools + active MCP tools
 * into the LLM tool choice set at execution time.
 */
export async function runAgentEngine(
  input: AgentEngineInput
): Promise<AgentEngineResult> {
  const modelSlug =
    input.modelSlug ||
    process.env.DEFAULT_HARNESS_MODEL ||
    'gemini-2.0-flash'

  const native = getNativeAiTools({
    mode: input.mode,
    requesterId: input.requesterId,
    scopeId: input.scopeId,
  })

  let mcpTools: ToolSet = {}
  if (input.includeMcpTools !== false) {
    try {
      mcpTools = await getMCPHostManager().getCombinedToolSet()
    } catch (e) {
      console.warn(
        '[agent-engine] MCP tools unavailable:',
        e instanceof Error ? e.message : e
      )
    }
  }

  const tools: ToolSet = { ...native, ...mcpTools }
  const toolNames = Object.keys(tools)

  const result = await generateText({
    model: getHarnessModel(modelSlug),
    system:
      input.system ||
      'أنت وكيل Arabic Buzz. استخدم الأدوات المتاحة عند الحاجة وأجب بالعربية الفصحى المهنية.',
    prompt: input.prompt,
    tools,
    stopWhen: stepCountIs(input.maxSteps ?? 5),
  })

  return {
    text: result.text,
    modelSlug,
    toolNames,
    steps: result.steps?.length ?? 1,
  }
}

/** Snapshot of tools the engine would bind right now (no LLM call). */
export async function listBoundEngineTools(opts?: {
  includeMcpTools?: boolean
}): Promise<{ native: string[]; mcp: string[]; all: string[] }> {
  const native = Object.keys(getNativeAiTools())
  let mcp: string[] = []
  if (opts?.includeMcpTools !== false) {
    try {
      mcp = Object.keys(await getMCPHostManager().getCombinedToolSet())
    } catch {
      mcp = []
    }
  }
  return { native, mcp, all: [...native, ...mcp] }
}
