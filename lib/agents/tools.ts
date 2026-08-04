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
  executeEditDocument,
  executeListFiles,
  executeListWorkspaceFiles,
  executeReadDocument,
  executeReadFile,
} from '@/lib/agents/tools/document-tools'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import { emitNotification } from '@/lib/notifications/emit'

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
    messageAr: 'استعلام قاعدة البيانات تجريبي.',
    rows: [],
  }),
  write_file: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة write_file غير مفعّلة في هذا الإصدار.',
  }),
  delete_file: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة delete_file غير مفعّلة في هذا الإصدار.',
  }),
  db_update: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة db_update غير مفعّلة في هذا الإصدار.',
  }),
  db_insert: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة db_insert غير مفعّلة في هذا الإصدار.',
  }),
  db_delete: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة db_delete غير مفعّلة في هذا الإصدار.',
  }),
  delete_database: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة delete_database غير مفعّلة في هذا الإصدار.',
  }),
  transfer_funds: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة transfer_funds غير مفعّلة في هذا الإصدار.',
  }),
  change_user_roles: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'أداة change_user_roles غير مفعّلة في هذا الإصدار.',
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
}

export function getToolExecutor(toolName: string): ToolExecutor {
  return (
    toolRegistry[toolName] ||
    (async () => {
      throw new Error(`Unknown tool: ${toolName}`)
    })
  )
}
