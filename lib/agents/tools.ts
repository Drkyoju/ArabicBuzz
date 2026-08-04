import { executeSearchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import {
  executeCalendarCreate,
  executeCalendarDelete,
  executeCalendarFindAlignment,
  executeCalendarFindDuplicates,
  executeCalendarList,
  executeCalendarScanEmail,
  executeCalendarUpdate,
} from '@/lib/agents/tools/calendar-tools'
import {
  executeRoomCalendarCancel,
  executeRoomCalendarCreate,
  executeRoomCalendarIngest,
  executeRoomCalendarList,
  executeRoomCalendarUpdate,
} from '@/lib/agents/tools/room-calendar-tools'
import {
  executeEditDocument,
  executeListFiles,
  executeListWorkspaceFiles,
  executeReadDocument,
  executeReadFile,
} from '@/lib/agents/tools/document-tools'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import { emitNotification } from '@/lib/notifications/emit'
import {
  deleteWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { executeBrowserTask } from '@/lib/tools/browser-rpa'
import { parseArabicDocument } from '@/lib/tools/arabic-ocr'
import { triggerExternalWorkflow } from '@/lib/tools/workflow-bridge'

export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>
) => Promise<unknown>

const stubResults: Record<string, (params: Record<string, unknown>) => unknown> = {
  web_search: (p) => ({
    stub: true,
    messageAr: 'بحث الويب التجريبي غير متصل بمزوّد حي — النتائج محاكاة.',
    results: [`نتائج بحث تجريبية عن: ${String(p.query || '')}`],
  }),
  web_fetch: (p) => ({
    stub: true,
    messageAr: 'جلب الصفحات تجريبي.',
    url: p.url,
    content: 'محتوى مقروء (تجريبي)',
  }),
  query_db_readonly: () => ({
    stub: true,
    messageAr: 'استعلام قاعدة البيانات التجريبي غير مفعّل.',
    rows: [],
  }),
  db_update: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr:
      'db_update غير متاح عمداً — استخدم أدوات الملفات/التقويم المعتمدة مع موافقة بشرية.',
  }),
  db_insert: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'db_insert غير متاح عمداً في هذا المنتج.',
  }),
  db_delete: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'db_delete غير متاح عمداً في هذا المنتج.',
  }),
  delete_database: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'delete_database محظور — لن يُنفَّذ أبداً من الوكيل.',
  }),
  transfer_funds: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'transfer_funds غير مدعوم — لا تحويلات مالية عبر الوكيل.',
  }),
  change_user_roles: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'change_user_roles غير مدعوم — غيّر الأدوار من الإعدادات يدوياً.',
  }),
  text_generate: (p) => ({ text: String(p.prompt || '') }),
}

async function executeMemorySearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '')
    .trim()
    .toLowerCase()
  const fromClient = Array.isArray(params.scopeMemory)
    ? (params.scopeMemory as unknown[]).map(String)
    : null
  const { DEMO_SCOPES, isPersonalScope, isSharedScope } = await import(
    '@/lib/scopes/manager'
  )
  const scopeId = String(params.scopeId || 'shared-demo')
  const scope = DEMO_SCOPES.find((s) => s.id === scopeId)
  const seeded = scope
    ? isPersonalScope(scope)
      ? scope.privateMemory
      : isSharedScope(scope)
        ? scope.sharedMemory
        : []
    : []
  const pool = fromClient && fromClient.length ? fromClient : seeded
  const hits = !query
    ? pool.slice(0, 8).map((text, i) => ({ id: `m-${i}`, text, score: 1 }))
    : pool
        .map((text, i) => {
          const t = text.toLowerCase()
          const score = t.includes(query)
            ? 1
            : query.split(/\s+/).filter((w) => w.length > 2 && t.includes(w))
                .length * 0.25
          return { id: `m-${i}`, text, score }
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
  return {
    query,
    count: hits.length,
    hits,
    messageAr:
      hits.length > 0
        ? `عُثر على ${hits.length} ذكرى`
        : 'لا نتائج في ذاكرة المساحة',
  }
}

export const toolRegistry: Record<string, ToolExecutor> = {
  ...Object.fromEntries(
    Object.entries(stubResults).map(([name, fn]) => [
      name,
      async (_n, params) => fn(params),
    ])
  ),
  memory_search: executeMemorySearch,
  list_files: executeListFiles,
  read_file: executeReadFile,
  list_workspace_files: executeListWorkspaceFiles,
  read_document: executeReadDocument,
  edit_document: executeEditDocument,
  search_knowledge_base: executeSearchKnowledgeBase,
  calendar_list_events: executeCalendarList,
  calendar_create_event: executeCalendarCreate,
  calendar_update_event: executeCalendarUpdate,
  calendar_delete_event: executeCalendarDelete,
  calendar_scan_email: executeCalendarScanEmail,
  calendar_find_duplicates: executeCalendarFindDuplicates,
  calendar_find_alignment: executeCalendarFindAlignment,
  room_calendar_list: executeRoomCalendarList,
  room_calendar_create: executeRoomCalendarCreate,
  room_calendar_update: executeRoomCalendarUpdate,
  room_calendar_cancel: executeRoomCalendarCancel,
  room_calendar_ingest: executeRoomCalendarIngest,
  drive_sync_brain: async (_n, params) => {
    const userId = String(params.userId || '')
    if (!userId || userId === 'local-owner') {
      throw new Error(
        'يلزم ربط Google من الإعدادات لمزامنة مجلد Drive إلى عقل الشركة.'
      )
    }
    return syncDriveFolderToBrain({
      userId,
      scopeId: String(params.scopeId || 'shared-demo'),
      folderId: params.folderId ? String(params.folderId) : undefined,
      maxFiles:
        typeof params.maxFiles === 'number' ? params.maxFiles : undefined,
    })
  },
  write_file: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const name = String(
      params.name || params.filename || params.path || 'note.txt'
    ).trim()
    const content = String(params.content || params.text || '')
    if (!content) {
      throw new Error('يلزم content لكتابة الملف.')
    }
    const saved = await saveWorkspaceFile({
      scopeId,
      buffer: Buffer.from(content, 'utf8'),
      originalName: name,
      mimeType: String(params.mimeType || 'text/plain; charset=utf-8'),
      replaceId: params.fileId ? String(params.fileId) : undefined,
    })
    return {
      ok: true,
      fileId: saved.file.id,
      name: saved.file.originalName,
      source: saved.source,
      messageAr: `تم حفظ الملف «${saved.file.originalName}».`,
    }
  },
  delete_file: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const fileId = String(params.fileId || params.id || '').trim()
    if (!fileId) throw new Error('يلزم fileId لحذف الملف.')
    return deleteWorkspaceFile(scopeId, fileId)
  },
  send_message: async (_n, params) => {
    const channel = String(params.channel || 'telegram') as
      | 'telegram'
      | 'whatsapp'
    if (channel !== 'telegram' && channel !== 'whatsapp') {
      throw new Error('القناة غير مدعومة. استخدم telegram أو whatsapp.')
    }
    const textAr = String(params.textAr || params.messageAr || params.text || '').trim()
    if (!textAr) {
      throw new Error('يلزم textAr لإرسال الرسالة.')
    }
    const to = params.to ? String(params.to) : undefined
    const sent = await emitNotification({ channel, textAr, to })
    return {
      ok: sent.ok,
      channel,
      to: to || null,
      messageAr: sent.ok
        ? 'تم إرسال الرسالة عبر القناة.'
        : 'تعذّر الإرسال. تحقق من إعدادات القناة والمستلم.',
    }
  },
  browser_rpa: async (_n, params) => {
    return executeBrowserTask(
      String(params.taskPrompt || params.task || ''),
      String(params.targetUrl || params.url || '')
    )
  },
  arabic_ocr: async (_n, params) => {
    const src =
      params.fileUrl ||
      params.url ||
      params.contentBase64 ||
      params.buffer
    if (src == null || src === '') {
      throw new Error('يلزم fileUrl أو contentBase64 لمستند OCR.')
    }
    return parseArabicDocument(
      typeof src === 'string' ? src : Buffer.from(src as ArrayBuffer)
    )
  },
  trigger_workflow: async (_n, params) => {
    const workflowId = String(params.workflowId || params.id || '').trim()
    const payload =
      params.payload && typeof params.payload === 'object'
        ? (params.payload as Record<string, unknown>)
        : { ...params, workflowId: undefined, id: undefined, payload: undefined }
    return triggerExternalWorkflow(workflowId, payload)
  },
}

export function getToolExecutor(toolName: string): ToolExecutor {
  return (
    toolRegistry[toolName] ||
    (async () => {
      throw new Error(`Unknown tool: ${toolName}`)
    })
  )
}
