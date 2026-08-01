import { executeSearchKnowledgeBase } from '@/lib/agents/tools/rag-tool'

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
}

export function getToolExecutor(toolName: string): ToolExecutor {
  return (
    toolRegistry[toolName] ||
    (async () => {
      throw new Error(`Unknown tool: ${toolName}`)
    })
  )
}
