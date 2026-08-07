import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { StoredFileMeta, StoredKind } from '@/lib/storage/local'
import {
  buildEditedMeta,
  EDITED_TAG_AR,
  looksLikeEditedBackfill,
} from '@/lib/files/edited-status'

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

type CloudRow = {
  id: string
  scope_id: string
  original_name: string
  mime_type: string
  kind: string
  size: number
  created_at: string
  edited_at?: string | null
  edited_by?: string | null
  tags?: string[] | null
  content_base64?: string
}

function rowToMeta(r: CloudRow): StoredFileMeta {
  const tags = Array.isArray(r.tags) ? r.tags : []
  return {
    id: r.id,
    scopeId: r.scope_id,
    kind: (r.kind as StoredKind) || 'other',
    originalName: r.original_name,
    mimeType: r.mime_type || 'application/octet-stream',
    size: Number(r.size) || 0,
    relativePath: `cloud:${r.id}`,
    createdAt: r.created_at || new Date().toISOString(),
    sha256: '',
    editedAt: r.edited_at || undefined,
    editedBy: r.edited_by || undefined,
    tags: tags.length ? tags : undefined,
  }
}

export async function saveCloudFile(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
  markEdited?: boolean
  editedBy?: string
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
  const edited = opts.markEdited
    ? buildEditedMeta({ editedBy: opts.editedBy })
    : null
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
    ...(edited || {}),
  }

  const baseRow = {
    id,
    scope_id: opts.scopeId,
    original_name: opts.originalName,
    mime_type: meta.mimeType,
    kind,
    size: meta.size,
    content_base64: opts.buffer.toString('base64'),
  }

  let error = (
    await sb.from('workspace_files').upsert(
      (edited
        ? {
            ...baseRow,
            edited_at: edited.editedAt,
            edited_by: edited.editedBy,
            tags: edited.tags,
          }
        : baseRow) as never
    )
  ).error

  // Columns may not exist until migration 032 is applied
  if (error && edited && /edited_at|edited_by|tags|column/i.test(error.message)) {
    ;({ error } = await sb.from('workspace_files').upsert(baseRow as never))
  }

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

  let data: CloudRow[] | null = null
  let error: { message: string } | null = null

  const withEdit = await sb
    .from('workspace_files')
    .select(
      'id, scope_id, original_name, mime_type, kind, size, created_at, edited_at, edited_by, tags'
    )
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })

  if (withEdit.error && /edited_at|edited_by|tags|column/i.test(withEdit.error.message)) {
    const fallback = await sb
      .from('workspace_files')
      .select('id, scope_id, original_name, mime_type, kind, size, created_at')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
    data = (fallback.data as CloudRow[] | null) || null
    error = fallback.error
  } else {
    data = (withEdit.data as CloudRow[] | null) || null
    error = withEdit.error
  }

  if (error || !data) return []

  // Backfill known edited files (التويمان / fileId prefix) on list
  for (const r of data) {
    if (r.edited_at) continue
    if (!looksLikeEditedBackfill(r.id, r.original_name)) continue
    const edited = buildEditedMeta({ editedBy: 'backfill' })
    const { error: upErr } = await sb
      .from('workspace_files')
      .update({
        edited_at: edited.editedAt,
        edited_by: edited.editedBy,
        tags: edited.tags,
      } as never)
      .eq('id', r.id)
      .eq('scope_id', scopeId)
    if (!upErr) {
      r.edited_at = edited.editedAt
      r.edited_by = edited.editedBy
      r.tags = edited.tags
    } else {
      // Migration not applied — still show badge in API response
      r.edited_at = edited.editedAt
      r.edited_by = edited.editedBy
      r.tags = [EDITED_TAG_AR]
    }
  }

  return data.map(rowToMeta)
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
    meta: rowToMeta(data as CloudRow),
    buffer: Buffer.from(data.content_base64 as string, 'base64'),
  }
}

export async function replaceCloudFile(opts: {
  scopeId: string
  id: string
  buffer: Buffer
  originalName: string
  mimeType: string
  editedBy?: string
}): Promise<StoredFileMeta> {
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('لا قاعدة بيانات لاستبدال الملف السحابي')
  const kind = kindFromMime(opts.mimeType, opts.originalName)
  const edited = buildEditedMeta({ editedBy: opts.editedBy || 'agent' })
  const baseRow = {
    id: opts.id,
    scope_id: opts.scopeId,
    original_name: opts.originalName,
    mime_type: opts.mimeType,
    kind,
    size: opts.buffer.length,
    content_base64: opts.buffer.toString('base64'),
  }
  let { error } = await sb.from('workspace_files').upsert({
    ...baseRow,
    edited_at: edited.editedAt,
    edited_by: edited.editedBy,
    tags: edited.tags,
  } as never)
  if (error && /edited_at|edited_by|tags|column/i.test(error.message)) {
    ;({ error } = await sb.from('workspace_files').upsert(baseRow as never))
  }
  if (error) throw new Error(error.message)
  return {
    id: opts.id,
    scopeId: opts.scopeId,
    kind,
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    size: opts.buffer.length,
    relativePath: `cloud:${opts.id}`,
    createdAt: new Date().toISOString(),
    sha256: '',
    ...edited,
  }
}
