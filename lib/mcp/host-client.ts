/**
 * MCPClientHost — facade over MCPHostManager matching the agent-facing API.
 *
 * Converts connected MCP servers (PostgreSQL, GitHub, Slack, SQLite, FS, …)
 * into Vercel AI SDK tools at execution time.
 *
 * GitHub: modelcontextprotocol/servers · @modelcontextprotocol/sdk
 */

import {
  getMCPHostManager,
  type MCPServerConfig,
  type VercelAITool,
} from '@/lib/mcp/client-manager'

export type { MCPServerConfig }

/** Preset HTTP/SSE MCP server templates (user still supplies URL / secrets). */
export const MCP_SERVER_PRESETS = [
  {
    id: 'filesystem',
    nameAr: 'نظام الملفات',
    name: 'Filesystem',
    hint: 'npx -y @modelcontextprotocol/server-filesystem /path',
    transport: 'stdio' as const,
  },
  {
    id: 'postgres',
    nameAr: 'PostgreSQL',
    name: 'PostgreSQL',
    hint: 'npx -y @modelcontextprotocol/server-postgres $DATABASE_URL',
    transport: 'stdio' as const,
  },
  {
    id: 'github',
    nameAr: 'GitHub',
    name: 'GitHub',
    hint: 'npx -y @modelcontextprotocol/server-github',
    transport: 'stdio' as const,
  },
  {
    id: 'sqlite',
    nameAr: 'SQLite',
    name: 'SQLite',
    hint: 'npx -y mcp-server-sqlite --db-path ./data.db',
    transport: 'stdio' as const,
  },
  {
    id: 'slack',
    nameAr: 'Slack',
    name: 'Slack',
    hint: 'Remote SSE/HTTP Slack MCP URL',
    transport: 'sse' as const,
  },
] as const

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

  /** Array form — useful for inspection UIs. */
  async getCombinedTools(): Promise<VercelAITool[]> {
    return this.host.getCombinedTools()
  }

  /** Keyed ToolSet for generateText / streamText. */
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
}

export function getMCPClientHost(): MCPClientHost {
  if (!globalForHost.__arabicBuzzMcpClientHost) {
    globalForHost.__arabicBuzzMcpClientHost = new MCPClientHost()
  }
  return globalForHost.__arabicBuzzMcpClientHost
}

/** Auto-connect optional remote MCP URLs from env (HTTP/SSE only on Netlify). */
export async function connectEnvMcpServers(): Promise<string[]> {
  const host = getMCPClientHost()
  const connected: string[] = []
  const raw = process.env.MCP_REMOTE_SERVERS?.trim()
  if (!raw) return connected
  try {
    const list = JSON.parse(raw) as Array<{
      id: string
      name?: string
      url: string
    }>
    for (const item of list) {
      if (!item?.id || !item?.url) continue
      await host.connectServer({
        id: item.id,
        name: item.name || item.id,
        transport: 'sse',
        commandOrUrl: item.url,
      })
      connected.push(item.id)
    }
  } catch (e) {
    console.warn(
      '[mcp] MCP_REMOTE_SERVERS parse/connect failed',
      e instanceof Error ? e.message : e
    )
  }
  return connected
}
