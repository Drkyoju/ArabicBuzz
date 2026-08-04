import { NextRequest, NextResponse } from 'next/server'
import {
  getMCPHostManager,
  type MCPServerConfig,
} from '@/lib/mcp/client-manager'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { MCP_CATALOG } from '@/lib/mcp/catalog'
import {
  disableStoredMcpConnection,
  upsertStoredMcpConnection,
} from '@/lib/mcp/persist'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseServerConfig(body: unknown): MCPServerConfig {
  if (!body || typeof body !== 'object') {
    throw new Error('جسم الطلب غير صالح')
  }
  const b = body as Record<string, unknown>
  const id = String(b.id || '').trim()
  const name = String(b.name || b.nameAr || '').trim()
  const transport =
    b.transport === 'stdio' || b.transport === 'sse' ? b.transport : null
  const commandOrUrl = String(b.commandOrUrl || b.url || '').trim()

  if (!id) throw new Error('المعرّف مطلوب')
  if (!name) throw new Error('الاسم مطلوب')
  if (!transport) throw new Error('النقل يجب أن يكون sse أو stdio')
  if (!commandOrUrl) throw new Error('الرابط أو الأمر مطلوب')

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

/** GET — catalog (Arabic) + connected servers. */
export async function GET(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    await connectEnvMcpServers()
  } catch {
    /* ignore */
  }
  const host = getMCPHostManager()
  const servers = host.listServers()
  return NextResponse.json({
    messageAr: 'كتالوج أدوات MCP — وصف عربي وما هو متصل الآن.',
    catalog: MCP_CATALOG,
    servers,
    toolCount: servers.reduce((n, s) => n + s.tools.length, 0),
    netlifyNoteAr:
      'على Netlify يعمل الاتصال البعيد (SSE/HTTP) فقط. أدوات الماك (stdio) عبر جسر محلي.',
  })
}

/** POST — connect MCP server (remote URL preferred on Netlify). */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const body = await req.json()
    const catalogId = String(
      (body as { catalogId?: string }).catalogId || ''
    ).trim()
    const catalog = catalogId
      ? MCP_CATALOG.find((c) => c.id === catalogId)
      : undefined

    let config: MCPServerConfig
    if (
      catalog &&
      !(body as { commandOrUrl?: string }).commandOrUrl &&
      !(body as { url?: string }).url
    ) {
      if (!catalog.defaultUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: `«${catalog.nameAr}» يحتاج رابطاً يدوياً — ${catalog.setupHintAr}`,
          },
          { status: 400 }
        )
      }
      config = {
        id: catalog.id,
        name: catalog.nameAr,
        transport: 'sse',
        commandOrUrl: catalog.defaultUrl,
      }
    } else {
      config = parseServerConfig(body)
      if (catalog && !config.name) config.name = catalog.nameAr
    }

    if (config.transport === 'stdio') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'stdio غير متاح على Netlify. استخدم رابط SSE بعيد أو شغّل الجسر على الماك.',
          messageAr:
            'stdio غير متاح على Netlify. استخدم رابط SSE بعيد أو شغّل الجسر على الماك.',
        },
        { status: 400 }
      )
    }

    const host = getMCPHostManager()
    await host.connectServer(config)

    await upsertStoredMcpConnection({
      id: config.id,
      nameAr: config.name,
      url: config.commandOrUrl,
      catalogId: catalog?.id || null,
      enabled: true,
    })

    const connected = host.listServers().find((s) => s.id === config.id)
    return NextResponse.json(
      {
        ok: true,
        server: connected,
        messageAr: `تم الاتصال بـ «${config.name}» — ${connected?.tools.length || 0} أداة.`,
      },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'فشل الاتصال بخادم MCP',
      },
      { status: 400 }
    )
  }
}

/** DELETE — disconnect + disable persistence. */
export async function DELETE(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
  }
  const host = getMCPHostManager()
  await host.disconnectServer(id)
  await disableStoredMcpConnection(id)
  return NextResponse.json({
    ok: true,
    messageAr: `فُصل الخادم «${id}».`,
  })
}
