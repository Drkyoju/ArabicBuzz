import { NextRequest, NextResponse } from 'next/server'
import {
  getMCPHostManager,
  type MCPServerConfig,
} from '@/lib/mcp/client-manager'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseServerConfig(body: unknown): MCPServerConfig {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid JSON body')
  }
  const b = body as Record<string, unknown>
  const id = String(b.id || '').trim()
  const name = String(b.name || '').trim()
  const transport = b.transport === 'stdio' || b.transport === 'sse'
    ? b.transport
    : null
  const commandOrUrl = String(b.commandOrUrl || '').trim()

  if (!id) throw new Error('id is required')
  if (!name) throw new Error('name is required')
  if (!transport) throw new Error('transport must be "stdio" or "sse"')
  if (!commandOrUrl) throw new Error('commandOrUrl is required')

  const args = Array.isArray(b.args)
    ? b.args.map((a) => String(a))
    : undefined

  let env: Record<string, string> | undefined
  if (b.env && typeof b.env === 'object' && !Array.isArray(b.env)) {
    env = Object.fromEntries(
      Object.entries(b.env as Record<string, unknown>).map(([k, v]) => [
        k,
        String(v),
      ])
    )
  }

  return { id, name, transport, commandOrUrl, args, env }
}

/** GET — connected MCP servers and their active tools. */
export async function GET() {
  const host = getMCPHostManager()
  const servers = host.listServers()
  return NextResponse.json({
    servers,
    toolCount: servers.reduce((n, s) => n + s.tools.length, 0),
  })
}

/**
 * POST — add & connect an MCP server.
 * Examples:
 *   { "id": "github", "name": "GitHub", "transport": "stdio",
 *     "commandOrUrl": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
 *     "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." } }
 *   { "id": "postgres", "name": "PostgreSQL", "transport": "stdio",
 *     "commandOrUrl": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."] }
 *   { "id": "remote", "name": "Remote SSE", "transport": "sse",
 *     "commandOrUrl": "https://example.com/sse" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const config = parseServerConfig(body)
    const host = getMCPHostManager()
    await host.connectServer(config)
    const connected = host.listServers().find((s) => s.id === config.id)
    return NextResponse.json(
      {
        ok: true,
        server: connected,
      },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to connect MCP server',
      },
      { status: 400 }
    )
  }
}
