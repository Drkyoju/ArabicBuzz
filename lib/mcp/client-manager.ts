import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { dynamicTool, jsonSchema, type Tool } from 'ai'

type JsonSchemaObject = {
  type?: string
  properties?: Record<string, unknown>
  additionalProperties?: boolean
  [key: string]: unknown
}

export interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  commandOrUrl: string
  args?: string[]
  env?: Record<string, string>
}

export type VercelAITool = Tool<unknown, unknown>

export type MCPToolDescriptor = {
  serverId: string
  serverName: string
  name: string
  qualifiedName: string
  description?: string
  inputSchema?: unknown
}

type ConnectedServer = {
  config: MCPServerConfig
  client: Client
  tools: MCPToolDescriptor[]
}

function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

function qualifyToolName(serverId: string, toolName: string): string {
  return sanitizeToolName(`${serverId}__${toolName}`)
}

function asJsonSchema(schema: unknown): JsonSchemaObject {
  if (schema && typeof schema === 'object') {
    return schema as JsonSchemaObject
  }
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  }
}

function textFromCallResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const r = result as {
    content?: Array<{ type: string; text?: string }>
    structuredContent?: unknown
    isError?: boolean
  }
  if (r.structuredContent !== undefined) {
    return r.structuredContent
  }
  const texts = (r.content || [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0])
    } catch {
      return texts[0]
    }
  }
  if (texts.length > 1) return texts
  return result
}

export class MCPHostManager {
  private servers = new Map<string, ConnectedServer>()

  listServers(): Array<{
    id: string
    name: string
    transport: MCPServerConfig['transport']
    commandOrUrl: string
    connected: boolean
    tools: MCPToolDescriptor[]
  }> {
    return [...this.servers.values()].map((s) => ({
      id: s.config.id,
      name: s.config.name,
      transport: s.config.transport,
      commandOrUrl: s.config.commandOrUrl,
      connected: true,
      tools: s.tools,
    }))
  }

  getServerConfig(id: string): MCPServerConfig | undefined {
    return this.servers.get(id)?.config
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    if (!config.id?.trim()) throw new Error('MCP server id is required')
    if (!config.commandOrUrl?.trim()) {
      throw new Error('MCP commandOrUrl is required')
    }

    const existing = this.servers.get(config.id)
    if (existing) {
      await this.disconnectServer(config.id)
    }

    const client =
      config.transport === 'stdio'
        ? await this.connectStdio(config)
        : await this.connectHttpOrSse(config.commandOrUrl)

    const listed = await client.listTools()
    const tools: MCPToolDescriptor[] = (listed.tools || []).map((t) => ({
      serverId: config.id,
      serverName: config.name,
      name: t.name,
      qualifiedName: qualifyToolName(config.id, t.name),
      description: t.description,
      inputSchema: t.inputSchema,
    }))

    this.servers.set(config.id, { config, client, tools })
  }

  private async connectStdio(config: MCPServerConfig): Promise<Client> {
    const client = new Client(
      { name: 'arabic-buzz-mcp-host', version: '0.1.0' },
      { capabilities: {} }
    )
    const env = {
      ...getDefaultEnvironment(),
      ...(config.env || {}),
    }
    const transport = new StdioClientTransport({
      command: config.commandOrUrl,
      args: config.args || [],
      env,
      stderr: 'pipe',
    })
    await client.connect(transport)
    return client
  }

  /** Prefer Streamable HTTP; fall back to legacy SSE for older servers. */
  private async connectHttpOrSse(url: string): Promise<Client> {
    const baseUrl = new URL(url)
    const streamable = new Client(
      { name: 'arabic-buzz-mcp-host', version: '0.1.0' },
      { capabilities: {} }
    )
    try {
      await streamable.connect(new StreamableHTTPClientTransport(baseUrl))
      return streamable
    } catch {
      try {
        await streamable.close()
      } catch {
        // ignore
      }
      const sseClient = new Client(
        { name: 'arabic-buzz-mcp-host', version: '0.1.0' },
        { capabilities: {} }
      )
      await sseClient.connect(new SSEClientTransport(baseUrl))
      return sseClient
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const entry = this.servers.get(serverId)
    if (!entry) return
    try {
      await entry.client.close()
    } catch {
      // ignore close errors during teardown
    }
    this.servers.delete(serverId)
  }

  /**
   * Converts MCP tool definitions into Vercel AI SDK dynamic tools.
   * Prefer `getCombinedToolSet()` when binding to `generateText` (needs keyed names).
   */
  async getCombinedTools(): Promise<VercelAITool[]> {
    return Object.values(await this.getCombinedToolSet())
  }

  /** ToolSet keyed by `{serverId}__{toolName}` — ready for generateText. */
  async getCombinedToolSet(): Promise<Record<string, VercelAITool>> {
    const set: Record<string, VercelAITool> = {}
    for (const entry of this.servers.values()) {
      for (const desc of entry.tools) {
        const serverId = entry.config.id
        const toolName = desc.name
        set[desc.qualifiedName] = dynamicTool({
          description:
            desc.description ||
            `MCP tool ${toolName} from ${entry.config.name}`,
          // MCP inputSchema is JSON Schema; AI SDK accepts it via jsonSchema()
          inputSchema: jsonSchema(asJsonSchema(desc.inputSchema) as never),
          metadata: {
            mcpServerId: serverId,
            mcpToolName: toolName,
            mcpQualifiedName: desc.qualifiedName,
          },
          execute: async (args) => {
            return this.executeMCPTool(
              serverId,
              toolName,
              (args || {}) as Record<string, unknown>
            )
          },
        })
      }
    }
    return set
  }

  async executeMCPTool(
    serverId: string,
    toolName: string,
    args: object
  ): Promise<unknown> {
    const entry = this.servers.get(serverId)
    if (!entry) {
      throw new Error(`MCP server not connected: ${serverId}`)
    }

    const result = await entry.client.callTool({
      name: toolName,
      arguments: args as Record<string, unknown>,
    })

    if ('isError' in result && result.isError) {
      const errText = textFromCallResult(result)
      throw new Error(
        typeof errText === 'string'
          ? errText
          : `MCP tool error: ${toolName} on ${serverId}`
      )
    }

    return textFromCallResult(result)
  }

  async refreshTools(serverId?: string): Promise<void> {
    const targets = serverId
      ? ([this.servers.get(serverId)].filter(Boolean) as ConnectedServer[])
      : [...this.servers.values()]

    for (const entry of targets) {
      const listed = await entry.client.listTools()
      entry.tools = (listed.tools || []).map((t) => ({
        serverId: entry.config.id,
        serverName: entry.config.name,
        name: t.name,
        qualifiedName: qualifyToolName(entry.config.id, t.name),
        description: t.description,
        inputSchema: t.inputSchema,
      }))
    }
  }
}

const globalForMcp = globalThis as unknown as {
  __arabicBuzzMcpHost?: MCPHostManager
}

export function getMCPHostManager(): MCPHostManager {
  if (!globalForMcp.__arabicBuzzMcpHost) {
    globalForMcp.__arabicBuzzMcpHost = new MCPHostManager()
  }
  return globalForMcp.__arabicBuzzMcpHost
}
