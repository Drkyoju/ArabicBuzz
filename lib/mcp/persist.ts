/**
 * Persist MCP remote connections so Netlify cold starts can reconnect.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type StoredMcpConnection = {
  id: string
  nameAr: string
  url: string
  enabled: boolean
  catalogId: string | null
}

const mem = new Map<string, StoredMcpConnection>()

export async function listStoredMcpConnections(): Promise<StoredMcpConnection[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('mcp_connections')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true })
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        nameAr: String(r.name_ar || r.id),
        url: String(r.url),
        enabled: Boolean(r.enabled),
        catalogId: r.catalog_id ? String(r.catalog_id) : null,
      }))
    }
  }
  return [...mem.values()].filter((c) => c.enabled)
}

export async function upsertStoredMcpConnection(opts: {
  id: string
  nameAr: string
  url: string
  catalogId?: string | null
  enabled?: boolean
}): Promise<StoredMcpConnection> {
  const row: StoredMcpConnection = {
    id: opts.id,
    nameAr: opts.nameAr,
    url: opts.url,
    enabled: opts.enabled !== false,
    catalogId: opts.catalogId || null,
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    await sb.from('mcp_connections').upsert(
      {
        id: row.id,
        name_ar: row.nameAr,
        url: row.url,
        catalog_id: row.catalogId,
        enabled: row.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
  }
  mem.set(row.id, row)
  return row
}

export async function disableStoredMcpConnection(id: string) {
  const sb = getSupabaseAdmin()
  if (sb) {
    await sb
      .from('mcp_connections')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', id)
  }
  mem.delete(id)
}

export function newMcpConnectionId(catalogId?: string) {
  return catalogId || `mcp-${randomUUID().slice(0, 8)}`
}
