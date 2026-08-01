import { executeSearchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import {
  executeCalendarCreate,
  executeCalendarDelete,
  executeCalendarFindDuplicates,
  executeCalendarList,
  executeCalendarScanEmail,
  executeCalendarUpdate,
} from '@/lib/agents/tools/calendar-tools'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'

export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>
) => Promise<unknown>

const stubResults: Record<string, (params: Record<string, unknown>) => unknown> = {
  web_search: (p) => ({ results: [`نتائج بحث عن: ${String(p.query || '')}`] }),
  web_fetch: (p) => ({ url: p.url, content: 'محتوى مقروء (تجريبي)' }),
  read_file: (p) => ({ path: p.path, content: '// file contents' }),
  list_files: () => ({ files: ['README.md', 'HEARTBEAT.md'] }),
  query_db_readonly: () => ({ rows: [] }),
  memory_search: () => ({ hits: [] }),
  write_file: (p) => ({ written: true, path: p.path }),
  send_message: (p) => ({ sent: true, channel: p.channel || 'telegram' }),
  delete_file: (p) => ({ deleted: true, path: p.path }),
  db_update: () => ({ updated: true }),
  db_insert: () => ({ inserted: true }),
  db_delete: () => ({ deleted: true }),
  delete_database: () => ({ deleted: true }),
  transfer_funds: () => ({ transferred: true }),
  change_user_roles: () => ({ changed: true }),
  text_generate: (p) => ({ text: String(p.prompt || '') }),
}

export const toolRegistry: Record<string, ToolExecutor> = {
  ...Object.fromEntries(
    Object.entries(stubResults).map(([name, fn]) => [
      name,
      async (_n, params) => fn(params),
    ])
  ),
  search_knowledge_base: executeSearchKnowledgeBase,
  calendar_list_events: executeCalendarList,
  calendar_create_event: executeCalendarCreate,
  calendar_update_event: executeCalendarUpdate,
  calendar_delete_event: executeCalendarDelete,
  calendar_scan_email: executeCalendarScanEmail,
  calendar_find_duplicates: executeCalendarFindDuplicates,
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
}

export function getToolExecutor(toolName: string): ToolExecutor {
  return (
    toolRegistry[toolName] ||
    (async () => {
      throw new Error(`Unknown tool: ${toolName}`)
    })
  )
}
