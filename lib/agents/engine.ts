import { generateText, stepCountIs, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { getToolExecutor, toolRegistry } from '@/lib/agents/tools'
import { searchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import { interceptToolExecution } from '@/lib/agents/interceptor'
import {
  parsePosture,
  type SecurityPostureMode,
} from '@/lib/security/posture'
import { withSpan } from '@/lib/observability/trace'
import { forceFlushOtel } from '@/lib/observability/langfuse'
import { extractFromAgentSteps } from '@/lib/agents/citation-events'

/** Local stub tools exposed as Vercel AI SDK schemas. */
export function getNativeAiTools(opts?: {
  mode?: SecurityPostureMode
  requesterId?: string
  scopeId?: string
  scopeMemory?: string[]
}): ToolSet {
  const mode = opts?.mode || parsePosture(process.env.DEFAULT_SECURITY_POSTURE)
  const requesterId = opts?.requesterId || 'engine'
  const scopeId = opts?.scopeId
  const scopeMemory = opts?.scopeMemory

  const native: ToolSet = {
    web_search: tool({
      description:
        'بحث ويب حي عن استعلام عربي/إنجليزي وإرجاع روابط (مجاني: DuckDuckGo + ويكيبيديا + gov.sa؛ Brave اختياري بمفتاح).',
      inputSchema: z.object({
        query: z.string().describe('نص البحث'),
        queryAr: z.string().optional().describe('بديل عربي لنص البحث إن لم يُمرَّر query'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'web_search',
          params: {
            ...params,
            query: params.query || params.queryAr || '',
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('web_search'),
        }),
    }),
    web_fetch: tool({
      description:
        'جلب محتوى صفحة ويب حقيقي من رابط http(s) واستخراج النص للقراءة.',
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
        'استخراج نص مستند مكتبي مرفوع (Word، Excel، PowerPoint، PDF) مع OCR تلقائي للصفحات الممسوحة. للصور أو طلب بحث داخل صورة/PDF ممسوح فضّل arabic_ocr.',
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
        'إنشاء ملف جديد أو تعديل ملف موجود (Word/Excel/PowerPoint/نص/PDF) وإظهار زر تنزيل في الشات. لإنشاء ملف: لا تمرّر fileId ومرّر format + body/paragraphs. لتعديل ملف غرفة: اقرأ بـ read_document أولاً. لملفات عقل الشركة (Drive): brain_open_document ثم عدّل ثم brain_save_document.',
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
          .enum(['docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'pdf'])
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
    convert_document: tool({
      description:
        'تحويل PDF ↔ Word (docx) مع الحفاظ على النص العربي عبر إعادة بناء نصية. استخدمه عندما يطلب المستخدم تحويل الصيغة. النتيجة تظهر كملف قابل للتنزيل في الشات.',
      inputSchema: z.object({
        fileId: z.string().describe('معرّف الملف في مساحة الغرفة'),
        toFormat: z
          .enum(['docx', 'pdf', 'txt', 'md'])
          .describe('الصيغة الهدف — docx لـ Word، pdf لـ PDF'),
        outputName: z.string().optional(),
        title: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'convert_document',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('convert_document'),
        }),
    }),
    return_file: tool({
      description:
        'إظهار ملف موجود من مساحة الغرفة كزر تنزيل في الشات دون تعديله.',
      inputSchema: z.object({
        fileId: z.string().describe('معرّف الملف أو اسمه'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'return_file',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('return_file'),
        }),
    }),
    write_file: tool({
      description:
        'إنشاء أو استبدال ملف نصي بسيط في مساحة الغرفة وإرجاعه للتنزيل في الشات.',
      inputSchema: z.object({
        name: z.string().describe('اسم الملف مثل ملاحظات.txt'),
        content: z.string().describe('المحتوى النصي'),
        fileId: z.string().optional().describe('لاستبدال ملف موجود'),
        mimeType: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'write_file',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('write_file'),
        }),
    }),
    delete_file: tool({
      description:
        'حذف ملف من مساحة الغرفة (الخزنة). استخدم list_workspace_files أولاً. لحذف من Drive استخدم brain_delete_document.',
      inputSchema: z.object({
        fileId: z.string().describe('معرّف الملف أو اسمه'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'delete_file',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('delete_file'),
        }),
    }),
    read_excel: tool({
      description:
        'قراءة صفوف Excel كجدول منظم قبل التعديل الخلوي. أفضل من read_document لجداول xlsx.',
      inputSchema: z.object({
        fileId: z.string(),
        sheet: z.string().optional(),
        maxRows: z.number().optional(),
        maxCols: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'read_excel',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('read_excel'),
        }),
    }),
    edit_excel: tool({
      description:
        'تعديل خلايا Excel مع الحفاظ على بنية الملف (exceljs) ثم إرجاع النسخة المعدّلة للتنزيل في الشات. مرّر cells مثل [{cell:"B2", value:"نص"}].',
      inputSchema: z.object({
        fileId: z.string(),
        sheet: z.string().optional(),
        cells: z
          .array(
            z.object({
              cell: z.string().optional().describe('مثل B12'),
              row: z.number().optional(),
              col: z.number().optional(),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
              sheet: z.string().optional(),
            })
          )
          .min(1),
        outputName: z.string().optional(),
        replaceSource: z.boolean().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'edit_excel',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('edit_excel'),
        }),
    }),
    edit_image: tool({
      description:
        'تعديل صورة مرفوعة (تدوير، قلب، تحجيم، رمادي، ضبابية، نص عربي فوق الصورة) وإرجاعها للتنزيل في الشات.',
      inputSchema: z.object({
        fileId: z.string(),
        rotate: z.number().optional().describe('درجات مثل 90'),
        flipHorizontal: z.boolean().optional(),
        flipVertical: z.boolean().optional(),
        grayscale: z.boolean().optional(),
        blur: z.number().optional(),
        sharpen: z.boolean().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        overlayText: z.string().optional().describe('نص عربي يُختم أسفل الصورة'),
        overlayColor: z.string().optional(),
        format: z.enum(['png', 'jpeg', 'jpg', 'webp']).optional(),
        outputName: z.string().optional(),
        replaceSource: z.boolean().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'edit_image',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('edit_image'),
        }),
    }),
    generate_image_edit: tool({
      description:
        'تعديل/إعادة توليد صورة بوصف عربي عبر Gemini (توليدي). للتعديلات البسيطة فضّل edit_image.',
      inputSchema: z.object({
        fileId: z.string().optional().describe('صورة مصدر اختيارية'),
        promptAr: z.string().describe('وصف التعديل بالعربية'),
        outputName: z.string().optional(),
        replaceSource: z.boolean().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'generate_image_edit',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('generate_image_edit'),
        }),
    }),
    brain_open_document: tool({
      description:
        'فتح ملف من مجلد عقل الشركة على Google Drive داخل مساحة الغرفة للتعديل أو التحويل. استخدم اسم الملف أو معرّف Drive.',
      inputSchema: z.object({
        name: z
          .string()
          .optional()
          .describe('اسم الملف كما في Drive مثل محضر اجتماع.pdf'),
        driveFileId: z.string().optional().describe('معرّف Drive إن عُرف'),
        queryAr: z.string().optional().describe('بحث بالاسم'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'brain_open_document',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('brain_open_document'),
        }),
    }),
    brain_save_document: tool({
      description:
        'حفظ ملف معدّل من مساحة الغرفة إلى مجلد Drive (عقل الشركة) وإعادة فهرسته للبحث. مرّر fileId من edit_document وdriveFileId إن كنت تحدّث ملفاً موجوداً.',
      inputSchema: z.object({
        fileId: z.string().describe('معرّف ملف الغرفة بعد التعديل'),
        driveFileId: z
          .string()
          .optional()
          .describe('معرّف Drive للتحديث؛ اتركه فارغاً لرفع ملف جديد'),
        outputName: z.string().optional(),
        asNew: z.boolean().optional().describe('true لرفع نسخة جديدة دائماً'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'brain_save_document',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('brain_save_document'),
        }),
    }),
    brain_create_document: tool({
      description:
        'رفع ملف من مساحة الغرفة كمستند جديد دائماً إلى مجلد عقل الشركة على Drive.',
      inputSchema: z.object({
        fileId: z.string(),
        outputName: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'brain_create_document',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
            asNew: true,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('brain_create_document'),
        }),
    }),
    brain_delete_document: tool({
      description:
        'نقل ملف من مجلد عقل الشركة (Drive) إلى سلة المهملات وإزالته من فهرس البحث. يتطلب ربط Google.',
      inputSchema: z.object({
        driveFileId: z.string().optional(),
        name: z.string().optional().describe('اسم الملف على Drive'),
        queryAr: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'brain_delete_document',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('brain_delete_document'),
        }),
    }),
    fill_policy_audit: tool({
      description:
        'تعبئة نماذج Excel للتدقيق (تدقيق سياسة/لائحة/خصوصية…) من نصوص عقل الشركة ثم إرجاع ملف معبّأ للتنزيل والمراجعة البشرية.',
      inputSchema: z.object({
        topicAr: z
          .string()
          .describe('موضوع التدقيق مثل سياسة خصوصية البيانات'),
        queryAr: z
          .string()
          .optional()
          .describe('بديل اختياري لـ topicAr'),
        templateName: z
          .string()
          .optional()
          .describe('جزء من اسم ملف القالب مثل تدقيق سياسة'),
        fileId: z.string().optional().describe('معرّف قالب في مساحة الغرفة'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'fill_policy_audit',
          params: {
            ...params,
            topicAr: params.topicAr || params.queryAr,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('fill_policy_audit'),
        }),
    }),
    send_director_digest: tool({
      description:
        'إرسال ملخص «ما ينتظر قرارك» لمدير الجمعية بالبريد (Resend) و/أو تيليجرام: موافقات + مواعيد نظامية + مهام.',
      inputSchema: z.object({
        toEmail: z
          .string()
          .optional()
          .describe('بريد المدير إن اختلف عن DIRECTOR_EMAIL'),
        nameAr: z
          .string()
          .optional()
          .describe('اسم المخاطب؛ الافتراضي DIGEST_NAME_AR'),
        channels: z
          .array(z.enum(['email', 'telegram']))
          .optional()
          .describe('قنوات الإرسال؛ الافتراضي بريد + تيليجرام'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'send_director_digest',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('send_director_digest'),
        }),
    }),
    pdf_create: tool({
      description: 'إنشاء PDF جديد من نص عربي/إنجليزي في ملفات الغرفة.',
      inputSchema: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        paragraphs: z.array(z.string()).optional(),
        outputName: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'pdf_create',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('pdf_create'),
        }),
    }),
    pdf_stamp: tool({
      description: 'ختم نص على PDF موجود (تعليق/ملاحظة) وحفظ نسخة في الغرفة.',
      inputSchema: z.object({
        fileId: z.string(),
        text: z.string(),
        pageIndex: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        size: z.number().optional(),
        outputName: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'pdf_stamp',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('pdf_stamp'),
        }),
    }),
    pdf_merge: tool({
      description: 'دمج عدة ملفات PDF من مساحة الغرفة في ملف واحد.',
      inputSchema: z.object({
        fileIds: z.array(z.string()).min(2),
        outputName: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'pdf_merge',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('pdf_merge'),
        }),
    }),
    pdf_list_fields: tool({
      description: 'عرض حقول نموذج AcroForm في PDF قبل التعبئة.',
      inputSchema: z.object({ fileId: z.string() }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'pdf_list_fields',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('pdf_list_fields'),
        }),
    }),
    pdf_fill_form: tool({
      description: 'تعبئة حقول نموذج PDF ثم حفظ نسخة في ملفات الغرفة.',
      inputSchema: z.object({
        fileId: z.string(),
        fields: z.record(z.string(), z.union([z.string(), z.boolean()])),
        flatten: z.boolean().optional(),
        outputName: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'pdf_fill_form',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('pdf_fill_form'),
        }),
    }),
    memory_search: tool({
      description:
        'بحث في ذاكرة الغرفة المشتركة (room_memories) وذاكرة النطاق — ليست خاصة بجهاز واحد.',
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
    send_message: tool({
      description:
        'إرسال رسالة نصية إلى تيليجرام أو واتساب. يدعم to اختياري (chat_id أو رقم E.164).',
      inputSchema: z.object({
        channel: z.enum(['telegram', 'whatsapp']).optional(),
        textAr: z.string().min(1),
        to: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'send_message',
          params,
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('send_message'),
        }),
    }),
    send_file: tool({
      description:
        'إرسال ملف من مساحة العمل كمرفق تيليجرام و/أو بريد إلكتروني لزميل.',
      inputSchema: z.object({
        fileId: z.string(),
        channel: z.enum(['telegram', 'email', 'both']).optional(),
        toEmail: z.string().optional(),
        captionAr: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'send_file',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('send_file'),
        }),
    }),
    search_knowledge_base: tool({
      description:
        'بحث في ملفات Google Drive المزامَنة فقط (عقل الشركة). لا يعيد نتائج من رفع محلي أو روابط.',
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
              source: 'drive',
            }),
        }),
    }),
    calendar_list_events: tool({
      description:
        'اختياري: مواعيد Google الشخصية. للعمل الجماعي استخدم room_calendar_list.',
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
        'اختياري: فراغات Google. للوحة الفريق اجمع التواريخ ثم room_calendar_ingest.',
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
    gmail_search: tool({
      description:
        'بحث في Gmail باستعلام Gmail (مثل newer_than:7d from:x أو كلمات عربية). قراءة فقط — لا إرسال.',
      inputSchema: z.object({
        query: z.string().describe('استعلام Gmail'),
        maxResults: z.number().optional().describe('حد أقصى 25'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'gmail_search',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('gmail_search'),
        }),
    }),
    gmail_read: tool({
      description:
        'قراءة نص رسالة Gmail كاملة بالمعرّف (بعد gmail_search). قراءة فقط.',
      inputSchema: z.object({
        messageId: z.string().describe('معرّف الرسالة من gmail_search'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'gmail_read',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('gmail_read'),
        }),
    }),
    gmail_send: tool({
      description:
        'إرسال بريد عبر Gmail المرتبط (إلى، موضوع، نص أو HTML). يتطلب موافقة بشرية (HITL) قبل الإرسال الفعلي. لا تختلق عناوين.',
      inputSchema: z.object({
        to: z.string().describe('عنوان المستلم (بريد حقيقي يحدده المستخدم)'),
        subject: z.string().describe('موضوع الرسالة'),
        bodyText: z
          .string()
          .optional()
          .describe('نص الرسالة العادي (مفضّل)'),
        bodyHtml: z
          .string()
          .optional()
          .describe('نسخة HTML اختيارية'),
        cc: z.string().optional().describe('نسخة كربونية اختيارية'),
        bcc: z.string().optional().describe('نسخة مخفية اختيارية'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'gmail_send',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('gmail_send'),
        }),
    }),
    sheets_read: tool({
      description:
        'قراءة نطاق من Google Sheets (معرّف الجدول + نطاق A1 مثل Sheet1!A1:D20).',
      inputSchema: z.object({
        spreadsheetId: z
          .string()
          .describe('معرّف الجدول أو رابط spreadsheets/d/...'),
        range: z
          .string()
          .describe('نطاق A1 مثل Sheet1!A1:Z50'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'sheets_read',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('sheets_read'),
        }),
    }),
    sheets_write: tool({
      description:
        'كتابة أو إلحاق قيم في Google Sheets. يتطلب موافقة بشرية (HITL). مرّر values كمصفوفة صفوف.',
      inputSchema: z.object({
        spreadsheetId: z.string(),
        range: z.string().describe('نطاق البداية مثل Sheet1!A1'),
        values: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe('صفوف القيم'),
        mode: z
          .enum(['update', 'append'])
          .optional()
          .describe('update يستبدل النطاق؛ append يضيف صفوفاً'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'sheets_write',
          params: { ...params, userId: requesterId },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('sheets_write'),
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
        'اختياري: موعد Google لدعوات خارجية/Zoom. داخلياً استخدم room_calendar_create.',
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
    room_calendar_list: tool({
      description:
        'عرض تقويم الغرفة المشترك (لوحة الفريق) — ليس تقويم Google الشخصي. المصدر الرسمي لمواعيد الفريق.',
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_list',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_list'),
        }),
    }),
    room_calendar_create: tool({
      description:
        'إضافة موعد إلى تقويم الغرفة المشترك (لكل الأعضاء). فضّله على calendar_create_event للعمل الجماعي الداخلي.',
      inputSchema: z.object({
        titleAr: z.string(),
        startsAt: z.string().describe('ISO datetime'),
        endsAt: z.string().describe('ISO datetime'),
        descriptionAr: z.string().optional(),
        locationAr: z.string().optional(),
        attendees: z.array(z.string()).optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_create',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_create'),
        }),
    }),
    room_calendar_ingest: tool({
      description:
        'دمج عدة مواعيد مقترحة من بريد موظفين مختلفين في تقويم الغرفة، مع تعديل التعارضات تلقائياً.',
      inputSchema: z.object({
        proposals: z.array(
          z.object({
            titleAr: z.string(),
            startsAt: z.string(),
            endsAt: z.string(),
            fromEmail: z.string().optional(),
            notesAr: z.string().optional(),
          })
        ),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_ingest',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_ingest'),
        }),
    }),
    room_calendar_update: tool({
      description: 'تعديل موعد موجود في تقويم الغرفة المشترك.',
      inputSchema: z.object({
        eventId: z.string(),
        titleAr: z.string().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        descriptionAr: z.string().optional(),
        status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_update',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_update'),
        }),
    }),
    room_calendar_cancel: tool({
      description: 'إلغاء موعد من تقويم الغرفة المشترك.',
      inputSchema: z.object({ eventId: z.string() }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_cancel',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_cancel'),
        }),
    }),
    room_calendar_reconcile: tool({
      description:
        'ترتيب مواعيد تقويم الغرفة حسب التاريخ/الوقت ومن أضافها، وكشف التعارضات (نفس الوقت). مع autoAdjust=true يُزاح الموعد اللاحق ويُنبَّه الغرفة.',
      inputSchema: z.object({
        autoAdjust: z
          .boolean()
          .optional()
          .describe('إن true يُعدّل زمن المواعيد المتعارضة تلقائياً'),
        notify: z
          .boolean()
          .optional()
          .describe('تنبيه الغرفة (تيليجرام إن رُبط) عند وجود تعارض'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_calendar_reconcile',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_calendar_reconcile'),
        }),
    }),
    room_tasks_list: tool({
      description:
        'عرض لوحة مهام/طلبات الغرفة المشتركة (ليست قائمة شخص واحد).',
      inputSchema: z.object({}),
      execute: async () =>
        interceptToolExecution({
          toolName: 'room_tasks_list',
          params: { scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_tasks_list'),
        }),
    }),
    room_tasks_create: tool({
      description: 'إضافة مهمة أو طلب إلى لوحة الغرفة المشتركة.',
      inputSchema: z.object({
        titleAr: z.string(),
        notesAr: z.string().optional(),
        priority: z.number().min(1).max(5).optional(),
        dueAt: z.string().optional(),
        assigneeAr: z.string().optional(),
        assigneeEmail: z.string().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_tasks_create',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_tasks_create'),
        }),
    }),
    room_tasks_reconcile: tool({
      description:
        'إعادة ترتيب مهام الغرفة حسب الأولوية والتاريخ وتأجيل المتأخر تلقائياً.',
      inputSchema: z.object({
        shiftOverdueDays: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_tasks_reconcile',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_tasks_reconcile'),
        }),
    }),
    room_tasks_update: tool({
      description: 'تعديل مهمة في لوحة الغرفة (موعد، أولوية، حالة، مسؤول).',
      inputSchema: z.object({
        taskId: z.string(),
        titleAr: z.string().optional(),
        dueAt: z.string().optional(),
        priority: z.number().optional(),
        status: z
          .enum(['open', 'in_progress', 'done', 'cancelled'])
          .optional(),
        assigneeAr: z.string().optional(),
        sortOrder: z.number().optional(),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_tasks_update',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_tasks_update'),
        }),
    }),
    room_memory_list: tool({
      description: 'قراءة ذاكرة الغرفة المشتركة (لكل الأعضاء).',
      inputSchema: z.object({}),
      execute: async () =>
        interceptToolExecution({
          toolName: 'room_memory_list',
          params: { scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_memory_list'),
        }),
    }),
    room_memory_add: tool({
      description: 'إضافة ذكرى إلى ذاكرة الغرفة المشتركة.',
      inputSchema: z.object({ content: z.string() }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'room_memory_add',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('room_memory_add'),
        }),
    }),
    browser_rpa: tool({
      description:
        'أتمتة متصفح عبر جسر الماك (browser-use ثم Playwright) أو BROWSER_USE_URL أو Steel — لتعبئة بوابات حكومية متكررة بحذر. يتطلب موافقة بشرية (HITL). لا تُدخل بيانات سرية دون تأكيد المستخدم.',
      inputSchema: z.object({
        taskPrompt: z.string().describe('وصف المهمة بالعربية أو الإنجليزية'),
        targetUrl: z.string().url().describe('رابط الصفحة المستهدفة'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'browser_rpa',
          params,
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('browser_rpa'),
        }),
    }),
    ingest_url_to_brain: tool({
      description:
        'سحب صفحة سياسات/أنظمة إلى معرفة الغرفة (مجاني: Jina Reader ثم جلب مباشر؛ Firecrawl اختياري بمفتاح).',
      inputSchema: z.object({
        url: z.string().url().optional().describe('رابط واحد'),
        urls: z
          .array(z.string().url())
          .optional()
          .describe('عدة روابط (حتى 8)'),
        titleAr: z.string().optional().describe('عنوان عربي للمستند في المعرفة'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'ingest_url_to_brain',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('ingest_url_to_brain'),
        }),
    }),
    read_decision_document: tool({
      description:
        'قراءة قرار طويل أو ممسوح (PDF) عبر OCR/MarkItDown وإضافته للمعرفة افتراضياً.',
      inputSchema: z.object({
        fileId: z.string().optional().describe('معرّف ملف من مساحة الغرفة'),
        fileUrl: z.string().optional(),
        contentBase64: z.string().optional(),
        titleAr: z.string().optional(),
        ingestToBrain: z.boolean().optional().describe('افتراضي true'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'read_decision_document',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('read_decision_document'),
        }),
    }),
    report_room_attendance: tool({
      description:
        'تقرير أعضاء الغرفة ونشاطهم وحضور الاجتماعات/Zoom من قاعدة البيانات.',
      inputSchema: z.object({
        days: z.number().optional().describe('عدد الأيام — افتراضي 14'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'report_room_attendance',
          params: { ...params, scopeId: scopeId || 'shared-demo' },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('report_room_attendance'),
        }),
    }),
    arabic_ocr: tool({
      description:
        'قراءة نص عربي من صورة أو PDF ممسوح (OCR عبر Gemini/Qari). مرّر fileId من مساحة الغرفة. يحفظ النص تلقائياً في ذاكرة الغرفة وملف .txt. للبحث عن عبارة: مرّر searchQuery. للقرارات الطويلة فضّل read_decision_document.',
      inputSchema: z.object({
        fileId: z
          .string()
          .optional()
          .describe('معرّف الملف أو اسمه من list_workspace_files / تيليجرام'),
        fileUrl: z
          .string()
          .optional()
          .describe('رابط الملف أو data URL'),
        contentBase64: z
          .string()
          .optional()
          .describe('محتوى الملف بصيغة base64 إن لم يتوفر fileId'),
        searchQuery: z
          .string()
          .optional()
          .describe('عبارة للبحث داخل النص المستخرج (مثل اسم أو رقم)'),
        saveToMemory: z
          .boolean()
          .optional()
          .describe('حفظ النص في ذاكرة الغرفة — افتراضي true'),
        saveAsFile: z
          .boolean()
          .optional()
          .describe('حفظ النص كملف .txt في الغرفة — افتراضي true'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'arabic_ocr',
          params: {
            ...params,
            scopeId: scopeId || 'shared-demo',
            userId: requesterId,
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('arabic_ocr'),
        }),
    }),
    trigger_workflow: tool({
      description:
        'تشغيل سير عمل خارجي (Activepieces / n8n / Trigger) عبر ويب هوك آمن.',
      inputSchema: z.object({
        workflowId: z
          .string()
          .describe('معرّف السير أو رابط الويب هوك الكامل'),
        payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('بيانات JSON للإرسال'),
      }),
      execute: async (params) =>
        interceptToolExecution({
          toolName: 'trigger_workflow',
          params: {
            workflowId: params.workflowId,
            payload: params.payload || {},
          },
          mode,
          requesterId,
          scopeId,
          execute: getToolExecutor('trigger_workflow'),
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
  /** When set, only bind these tool names (native + MCP intersection). */
  allowedTools?: string[]
}

export type AgentEngineResult = {
  text: string
  modelSlug: string
  toolNames: string[]
  steps: number
  citations: import('@/lib/scopes/types').RoomCitation[]
  pendingApprovalIds: string[]
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
    'gemini-3.1-pro'

  const native = getNativeAiTools({
    mode: input.mode,
    requesterId: input.requesterId,
    scopeId: input.scopeId,
  })

  let mcpTools: ToolSet = {}
  if (input.includeMcpTools !== false) {
    try {
      await connectEnvMcpServers()
      mcpTools = await getMCPHostManager().getCombinedToolSet()
    } catch (e) {
      console.warn(
        '[agent-engine] MCP tools unavailable:',
        e instanceof Error ? e.message : e
      )
    }
  }

  let tools: ToolSet = { ...native, ...mcpTools }
  if (input.allowedTools && input.allowedTools.length > 0) {
    const allow = new Set(input.allowedTools)
    const filtered: ToolSet = {}
    for (const name of Object.keys(tools)) {
      if (allow.has(name)) filtered[name] = tools[name]
    }
    tools = filtered
  }
  const toolNames = Object.keys(tools)

  try {
    const result = await withSpan(
      'agent.run',
      {
        'ab.model': modelSlug,
        'ab.scope_id': input.scopeId,
        'ab.tool_count': toolNames.length,
        'ab.include_mcp': input.includeMcpTools !== false,
        'ab.allowed_tools': input.allowedTools?.length ?? 0,
      },
      async () =>
        generateText({
          model: getHarnessModel(modelSlug),
          system:
            input.system ||
            'أنت وكيل Arabic Buzz. أجب دائماً بالعربية الفصحى المهنية (MSA) مع مصطلحات الجمعيات السعودية. استخدم الأدوات عند الحاجة. عند search_knowledge_base أو أي إجابة حساسة عن لوائح/تراخيص/قرارات: اذكر المصادر بصيغة [مصدر N: العنوان] ولا تختلق مواداً غير موجودة في النتائج. إن لم تجد مصدراً فقل ذلك صراحة.',
          prompt: input.prompt,
          tools,
          stopWhen: stepCountIs(input.maxSteps ?? 5),
        })
    )

    const extracted = extractFromAgentSteps(result.steps)

    return {
      text: result.text,
      modelSlug,
      toolNames,
      steps: result.steps?.length ?? 1,
      citations: extracted.citations,
      pendingApprovalIds: extracted.pendingApprovalIds,
    }
  } finally {
    // Serverless (Telegram / workflows): flush OTel → Langfuse before freeze.
    await forceFlushOtel()
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
