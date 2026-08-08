/**
 * Unified corpus search across org mail (inbox + sent + attachment text)
 * and workspace / knowledge files.
 */
import {
  searchMailMessages,
  type ImapMessageRow,
  type MailFolderFilter,
} from '@/lib/email/imap-store'
import { messageAttachments } from '@/lib/email/mail-intel'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type CorpusHit = {
  kind: 'mail' | 'mail_attachment' | 'workspace_file' | 'knowledge'
  id: string
  titleAr: string
  snippet: string
  href?: string
  folder?: string
  from?: string
  date?: string | null
  filename?: string
  messageId?: string
  fileId?: string
  scopeId?: string
}

function attachmentMatchSnippet(
  row: ImapMessageRow,
  q: string
): { filename: string; snippet: string } | null {
  const atts = messageAttachments(row)
  const needle = q.toLowerCase()
  for (const a of atts) {
    const hay = `${a.filename}\n${a.extractedText || ''}`.toLowerCase()
    if (!hay.includes(needle)) continue
    const text = (a.extractedText || '').replace(/\s+/g, ' ').trim()
    const idx = text.toLowerCase().indexOf(needle)
    const snippet =
      idx >= 0
        ? text.slice(Math.max(0, idx - 40), idx + needle.length + 80)
        : text.slice(0, 160) || a.filename
    return { filename: a.filename, snippet }
  }
  return null
}

export async function searchOrgMailCorpus(opts: {
  query: string
  limit?: number
  folder?: MailFolderFilter
  includeFiles?: boolean
}): Promise<{ hits: CorpusHit[]; messageAr: string }> {
  const q = opts.query.trim()
  if (!q) {
    return { hits: [], messageAr: 'اكتب كلمة للبحث في البريد والملفات.' }
  }
  const limit = Math.min(Math.max(opts.limit || 30, 1), 60)
  const hits: CorpusHit[] = []

  const rows = await searchMailMessages({
    query: q,
    limit,
    folder: opts.folder ?? 'all',
  })

  for (const row of rows) {
    const attHit = attachmentMatchSnippet(row, q)
    const bodyHit =
      `${row.subject}\n${row.from_addr}\n${row.to_addr}\n${row.snippet}\n${row.body_text}`
        .toLowerCase()
        .includes(q.toLowerCase())

    if (attHit && !bodyHit) {
      hits.push({
        kind: 'mail_attachment',
        id: `${row.id}:att`,
        titleAr: `مرفق: ${attHit.filename}`,
        snippet: attHit.snippet,
        href: `/?section=mail&msg=${encodeURIComponent(row.id)}`,
        folder: row.folder,
        from: row.from_addr,
        date: row.date_at ? new Date(row.date_at).toISOString() : null,
        filename: attHit.filename,
        messageId: row.id,
      })
    } else {
      hits.push({
        kind: 'mail',
        id: row.id,
        titleAr: row.subject || '(بدون موضوع)',
        snippet: (row.snippet || row.body_text || '').slice(0, 180),
        href: `/?section=mail&msg=${encodeURIComponent(row.id)}`,
        folder: row.folder,
        from: row.from_addr,
        date: row.date_at ? new Date(row.date_at).toISOString() : null,
        messageId: row.id,
      })
      if (attHit) {
        hits.push({
          kind: 'mail_attachment',
          id: `${row.id}:att`,
          titleAr: `مرفق داخل الرسالة: ${attHit.filename}`,
          snippet: attHit.snippet,
          href: `/?section=mail&msg=${encodeURIComponent(row.id)}`,
          folder: row.folder,
          filename: attHit.filename,
          messageId: row.id,
        })
      }
    }
  }

  if (opts.includeFiles !== false) {
    const sb = getSupabaseAdmin()
    const like = `%${q.replace(/%/g, '')}%`
    if (sb) {
      const { data: files } = await sb
        .from('workspace_files')
        .select('id, scope_id, original_name, mime_type, created_at')
        .ilike('original_name', like)
        .order('created_at', { ascending: false })
        .limit(12)
      for (const f of files || []) {
        hits.push({
          kind: 'workspace_file',
          id: String(f.id),
          titleAr: String(f.original_name),
          snippet: `ملف في الغرفة · ${f.mime_type || ''}`,
          href: `/?section=files&fileId=${encodeURIComponent(String(f.id))}&scopeId=${encodeURIComponent(String(f.scope_id))}`,
          fileId: String(f.id),
          scopeId: String(f.scope_id),
        })
      }
    }

    try {
      const { searchKnowledgeBase } = await import(
        '@/lib/agents/tools/rag-tool'
      )
      const kb = await searchKnowledgeBase({
        queryAr: q,
        scopeId: PRIMARY_TEAM_SCOPE_ID,
        limit: 8,
        source: 'all',
      })
      for (const doc of kb.documents || []) {
        const fileId =
          typeof doc.metadata?.sourceFileId === 'string'
            ? doc.metadata.sourceFileId
            : null
        hits.push({
          kind: 'knowledge',
          id: doc.id,
          titleAr: doc.titleAr || 'ملف معرفة',
          snippet: (doc.excerpt || '').slice(0, 180),
          href: fileId
            ? `/?section=files&fileId=${encodeURIComponent(fileId)}`
            : `/?section=files`,
          fileId: fileId || undefined,
          scopeId: PRIMARY_TEAM_SCOPE_ID,
        })
      }
    } catch {
      /* knowledge optional */
    }
  }

  const deduped: CorpusHit[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    const key = `${h.kind}:${h.id}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(h)
    if (deduped.length >= limit) break
  }

  return {
    hits: deduped,
    messageAr: deduped.length
      ? `وُجد ${deduped.length} نتيجة في البريد (وارد/مرسل/مرفقات) والملفات.`
      : 'لا نتائج — جرّب كلمة أخرى أو زامن الوارد والمرسل أولاً.',
  }
}
