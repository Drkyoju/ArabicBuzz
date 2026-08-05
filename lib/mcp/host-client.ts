/**
 * MCPClientHost — facade over MCPHostManager matching the agent-facing API.
 *
 * Converts connected MCP servers into Vercel AI SDK tools at execution time.
 */

import {
  getMCPHostManager,
  type MCPServerConfig,
  type VercelAITool,
} from '@/lib/mcp/client-manager'
import { MCP_CATALOG } from '@/lib/mcp/catalog'
import { listStoredMcpConnections } from '@/lib/mcp/persist'

export type { MCPServerConfig }

/** @deprecated Prefer MCP_CATALOG — kept for older imports. */
export const MCP_SERVER_PRESETS = MCP_CATALOG.filter(
  (c) => c.id === 'filesystem' || c.id === 'postgres' || c.id === 'github' || c.id === 'sqlite' || c.id === 'slack'
).map((c) => ({
  id: c.id,
  nameAr: c.nameAr,
  name: c.nameEn,
  hint: c.setupHintAr,
  transport: c.transport,
}))

export class MCPClientHost {
  private host = getMCPHostManager()

  connectServer(config: MCPServerConfig) {
    return this.host.connectServer(config)
  }

  disconnectServer(serverId: string) {
    return this.host.disconnectServer(serverId)
  }

  listServers() {
    return this.host.listServers()
  }

  async getCombinedTools(): Promise<VercelAITool[]> {
    return this.host.getCombinedTools()
  }

  async getCombinedToolSet(): Promise<Record<string, VercelAITool>> {
    return this.host.getCombinedToolSet()
  }

  executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ) {
    return this.host.executeMCPTool(serverId, toolName, args)
  }

  refreshTools(serverId?: string) {
    return this.host.refreshTools(serverId)
  }
}

const globalForHost = globalThis as unknown as {
  __arabicBuzzMcpClientHost?: MCPClientHost
  __arabicBuzzMcpEnvConnected?: boolean
}

export function getMCPClientHost(): MCPClientHost {
  if (!globalForHost.__arabicBuzzMcpClientHost) {
    globalForHost.__arabicBuzzMcpClientHost = new MCPClientHost()
  }
  return globalForHost.__arabicBuzzMcpClientHost
}

/** Auto-connect remote MCP URLs from env + persisted DB (HTTP/SSE on Netlify). */
export async function connectEnvMcpServers(): Promise<string[]> {
  const host = getMCPClientHost()
  const connected: string[] = []

  // Already wired this process instance
  if (globalForHost.__arabicBuzzMcpEnvConnected) {
    return host.listServers().map((s) => s.id)
  }

  const tryConnect = async (
    id: string,
    name: string,
    url: string
  ): Promise<boolean> => {
    try {
      await host.connectServer({
        id,
        name,
        transport: 'sse',
        commandOrUrl: url,
      })
      connected.push(id)
      return true
    } catch (e) {
      console.warn(
        `[mcp] connect ${id} failed:`,
        e instanceof Error ? e.message : e
      )
      return false
    }
  }

  // 1) Env JSON
  const raw = process.env.MCP_REMOTE_SERVERS?.trim()
  if (raw) {
    try {
      const list = JSON.parse(raw) as Array<{
        id: string
        name?: string
        url: string
      }>
      for (const item of list) {
        if (!item?.id || !item?.url) continue
        await tryConnect(item.id, item.name || item.id, item.url)
      }
    } catch (e) {
      console.warn(
        '[mcp] MCP_REMOTE_SERVERS parse failed',
        e instanceof Error ? e.message : e
      )
    }
  }

  // 2) Persisted connections
  try {
    const stored = await listStoredMcpConnections()
    for (const row of stored) {
      if (connected.includes(row.id)) continue
      await tryConnect(row.id, row.nameAr, row.url)
    }
  } catch (e) {
    console.warn(
      '[mcp] stored reconnect failed',
      e instanceof Error ? e.message : e
    )
  }

  // 3) Free/recommended defaults + remote catalog URLs when env/keys present
  // Stdio-only catalog items never auto-connect on Netlify (no local process).
  const autoDefaults =
    process.env.MCP_AUTO_DEFAULTS !== '0' &&
    process.env.MCP_AUTO_ANYBROWSE !== '0'

  // Developer-docs servers are noise for association staff — opt in explicitly.
  const context7Enabled = process.env.MCP_AUTO_CONTEXT7 === '1'
  const skipAuto = (id: string) => id === 'context7' && !context7Enabled

  if (autoDefaults) {
    for (const id of ['anybrowse', 'context7'] as const) {
      if (skipAuto(id)) continue
      const item = MCP_CATALOG.find((c) => c.id === id)
      if (item?.defaultUrl && !connected.includes(id)) {
        await tryConnect(id, item.nameAr, item.defaultUrl)
      }
    }
  }

  // Firecrawl remote MCP when API key present
  const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (firecrawlKey && !connected.includes('firecrawl')) {
    const fireUrl =
      process.env.FIRECRAWL_MCP_URL?.trim() ||
      `https://mcp.firecrawl.dev/${firecrawlKey}/v2/mcp`
    await tryConnect('firecrawl', 'Firecrawl', fireUrl)
  }

  // Supabase official MCP URL (project-specific)
  const supabaseMcp = process.env.SUPABASE_MCP_URL?.trim()
  if (supabaseMcp && !connected.includes('supabase')) {
    await tryConnect('supabase', 'Supabase', supabaseMcp)
  }

  // Brave Search remote MCP (BRAVE_API_KEY alone powers native web_search without MCP)
  const braveMcp = process.env.BRAVE_MCP_URL?.trim()
  if (braveMcp && !connected.includes('brave-search')) {
    await tryConnect('brave-search', 'Brave Search', braveMcp)
  }

  // Remaining remote/both catalog items: explicit MCP_<ID>_URL, or defaultUrl when autoDefaults
  for (const item of MCP_CATALOG) {
    if (item.runtime === 'local') continue
    if (item.transport === 'stdio' && !item.defaultUrl) continue
    if (connected.includes(item.id)) continue
    const envKey = `MCP_${item.id.replace(/-/g, '_').toUpperCase()}_URL`
    const explicit =
      process.env[envKey]?.trim() ||
      (item.id === 'brave-search'
        ? process.env.BRAVE_MCP_URL?.trim()
        : item.id === 'supabase'
          ? process.env.SUPABASE_MCP_URL?.trim()
          : item.id === 'firecrawl'
            ? process.env.FIRECRAWL_MCP_URL?.trim()
            : undefined)
    const url =
      explicit ||
      (autoDefaults && !skipAuto(item.id) ? item.defaultUrl : undefined)
    if (url && /^https?:\/\//i.test(url)) {
      await tryConnect(item.id, item.nameAr, url)
    }
  }

  globalForHost.__arabicBuzzMcpEnvConnected = true
  return connected
}
