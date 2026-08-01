import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { StoredFileMeta, StoredKind } from '@/lib/storage/local'

function kindFromMime(mime: string, name: string): StoredKind {
  const lower = name.toLowerCase()
  if (mime.includes('pdf') || lower.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('audio/') || /\.(ogg|mp3|wav|m4a|webm|opus)$/i.test(lower))
    return 'audio'
  if (mime.startsWith('image/')) return 'image'
  if (
    mime.includes('presentation') ||
    mime.includes('ms-powerpoint') ||
    /\.(pptx|ppt)$/i.test(lower)
  )
    return 'pptx'
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    /\.(xlsx|xls|csv)$/i.test(lower)
  )
    return 'xlsx'
  if (
    mime.includes('word') ||
    mime.includes('text') ||
    /\.(doc|docx|txt|md)$/i.test(lower)
  )
    return 'doc'
  return 'other'
}

const MAX_CLOUD_BYTES = 4 * 1024 * 1024

export async function saveCloudFile(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): Promise<{ ok: true; file: StoredFileMeta } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) {
    return {
      ok: false,
      error: 'لا قاعدة بيانات لحفظ الملف. أضف SUPABASE أو شغّل التخزين المحلي.',
    }
  }
  if (opts.buffer.length > MAX_CLOUD_BYTES) {
    return {
      ok: false,
      error: `الملف أكبر من 4MB للتخزين السحابي. استخدم «عقل الشركة» للمستندات أو شغّل npm run storage:sync على الماك.`,
    }
  }

  const id = randomUUID()
  const kind = kindFromMime(opts.mimeType, opts.originalName)
  const meta: StoredFileMeta = {
    id,
    scopeId: opts.scopeId,
    kind,
    originalName: opts.originalName,
    mimeType: opts.mimeType || 'application/octet-stream',
    size: opts.buffer.length,
    relativePath: `cloud:${id}`,
    createdAt: new Date().toISOString(),
    sha256: '',
  }

  const { error } = await sb.from('workspace_files').upsert({
    id,
    scope_id: opts.scopeId,
    original_name: opts.originalName,
    mime_type: meta.mimeType,
    kind,
    size: meta.size,
    content_base64: opts.buffer.toString('base64'),
  })

  if (error) {
    return {
      ok: false,
      error: `${error.message}. إن لم تُنشأ جدول الملفات بعد، طبّق supabase/migrations/011_workspace_files.sql`,
    }
  }

  return { ok: true, file: meta }
}

export async function listCloudFiles(scopeId: string): Promise<StoredFileMeta[]> {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  const { data, error } = await sb
    .from('workspace_files')
    .select('id, scope_id, original_name, mime_type, kind, size, created_at')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    scopeId: r.scope_id as string,
    kind: (r.kind as StoredKind) || 'other',
    originalName: r.original_name as string,
    mimeType: (r.mime_type as string) || 'application/octet-stream',
    size: Number(r.size) || 0,
    relativePath: `cloud:${r.id}`,
    createdAt: (r.created_at as string) || new Date().toISOString(),
    sha256: '',
  }))
}

export async function readCloudFile(
  scopeId: string,
  id: string
): Promise<{ meta: StoredFileMeta; buffer: Buffer } | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null
  const { data, error } = await sb
    .from('workspace_files')
    .select('*')
    .eq('id', id)
    .eq('scope_id', scopeId)
    .maybeSingle()
  if (error || !data?.content_base64) return null
  return {
    meta: {
      id: data.id as string,
      scopeId: data.scope_id as string,
      kind: (data.kind as StoredKind) || 'other',
      originalName: data.original_name as string,
      mimeType: (data.mime_type as string) || 'application/octet-stream',
      size: Number(data.size) || 0,
      relativePath: `cloud:${data.id}`,
      createdAt: (data.created_at as string) || new Date().toISOString(),
      sha256: '',
    },
    buffer: Buffer.from(data.content_base64 as string, 'base64'),
  }
}
