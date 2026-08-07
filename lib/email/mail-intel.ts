import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import {
  getMessageById,
  listMessages,
  updateMessageIntel,
  type ImapMessageRow,
  type MailIntelCache,
} from '@/lib/email/imap-store'
import {
  attachmentsContextText,
  type MailAttachmentMeta,
} from '@/lib/email/mail-attachments'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { getSupabaseAdmin } from '@/lib/supabase/server'

function modelSlug() {
  return IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-3.1-pro'
}

const analyzeSchema = z.object({
  summaryAr: z.string().describe('ملخص قصير بالعربية الفصحى'),
  draftSubject: z.string().describe('موضوع الرد'),
  draftBody: z.string().describe('مسودة رد مهنية بالعربية (أو الإنجليزية إن كانت الرسالة إنجليزية)'),
  dates: z.array(z.string()).describe('تواريخ مذكورة أو مستنتجة'),
  times: z.array(z.string()).describe('أوقات مذكورة'),
  names: z.array(z.string()).describe('أسماء أشخاص أو جهات'),
  important: z.array(z.string()).describe('نقاط مهمة أخرى (أرقام، مواعيد، طلبات، روابط)'),
})

function parseAttachments(row: ImapMessageRow): MailAttachmentMeta[] {
  const raw = (row as ImapMessageRow & { attachments_json?: unknown })
    .attachments_json
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? (parsed as MailAttachmentMeta[]) : []
  } catch {
    return []
  }
}

function parseIntel(row: ImapMessageRow): MailIntelCache | null {
  const raw = (row as ImapMessageRow & { intel_json?: unknown }).intel_json
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object'
      ? (parsed as MailIntelCache)
      : null
  } catch {
    return null
  }
}

export function messageAttachments(row: ImapMessageRow): MailAttachmentMeta[] {
  return parseAttachments(row)
}

export function messageIntel(row: ImapMessageRow): MailIntelCache | null {
  return parseIntel(row)
}

export async function analyzeMailMessage(
  messageId: string,
  opts?: { force?: boolean }
): Promise<{
  ok: boolean
  intel: MailIntelCache
  attachments: MailAttachmentMeta[]
  cached: boolean
  messageAr: string
}> {
  const row = await getMessageById(messageId)
  if (!row) throw new Error('الرسالة غير موجودة — زامن الوارد أولاً.')

  const attachments = parseAttachments(row)
  const existing = parseIntel(row)
  if (existing?.draftBody && !opts?.force) {
    return {
      ok: true,
      intel: existing,
      attachments,
      cached: true,
      messageAr: 'عُرض التحليل المحفوظ للرسالة.',
    }
  }

  const attCtx = attachmentsContextText(attachments)
  const prompt = `حلّل رسالة البريد التالية وجهّز مسودة رد.

من: ${row.from_addr}
إلى: ${row.to_addr}
الموضوع: ${row.subject}
التاريخ: ${row.date_at ? new Date(row.date_at).toISOString() : '—'}

النص:
${(row.body_text || row.snippet || '').slice(0, 18_000)}

${attCtx ? `المرفقات المستخرجة:\n${attCtx.slice(0, 14_000)}` : 'لا مرفقات نصية.'}

قواعد:
- summaryAr: 2–4 جمل فصحى.
- draftBody: رد جاهز للإرسال من جمعية الهدى والحكمة، مهذب ومختصر، دون اختلاق حقائق.
- إن كانت الرسالة إنجليزية يمكن الرد بالإنجليزية مع إبقاء summaryAr بالعربية.
- استخرج التواريخ والأوقات والأسماء وأي شيء مهم بدقة من النص/المرفقات فقط.`

  try {
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug()),
      schema: analyzeSchema,
      system:
        'أنت مساعد بريد جمعية الهدى والحكمة. تكتب بالعربية الفصحى المهنية وتستخرج كيانات بدقة دون اختلاق.',
      prompt,
    })

    const intel: MailIntelCache = {
      summaryAr: object.summaryAr,
      draftSubject: object.draftSubject || `Re: ${row.subject || ''}`.trim(),
      draftBody: object.draftBody,
      extract: {
        dates: object.dates || [],
        times: object.times || [],
        names: object.names || [],
        important: object.important || [],
      },
      analyzedAt: new Date().toISOString(),
    }
    await updateMessageIntel(messageId, intel)
    return {
      ok: true,
      intel,
      attachments,
      cached: false,
      messageAr: 'جهّز الوكيل ملخصاً ومسودة رد واستخراجاً ذكياً.',
    }
  } catch (e) {
    // Deterministic fallback when LLM unavailable
    const intel: MailIntelCache = {
      summaryAr: `رسالة من ${row.from_addr}: ${(row.snippet || row.subject || '').slice(0, 200)}`,
      draftSubject: /^(re|رد)\s*:/i.test(row.subject || '')
        ? row.subject
        : `Re: ${row.subject || '(بدون موضوع)'}`,
      draftBody: `السلام عليكم ورحمة الله وبركاته،\n\nشكراً لتواصلكم. تلقّينا رسالتكم بخصوص «${row.subject || '—'}» وسنراجعها ونعود إليكم.\n\nمع خالص التحية،\nجمعية الهدى والحكمة`,
      extract: heuristicExtract(row.body_text || row.snippet || ''),
      analyzedAt: new Date().toISOString(),
      fallbackNoteAr:
        e instanceof Error
          ? `تعذّر التحليل بالوكيل (${e.message}) — عُرضت مسودة أساسية.`
          : 'تعذّر التحليل بالوكيل — عُرضت مسودة أساسية.',
    }
    await updateMessageIntel(messageId, intel).catch(() => null)
    return {
      ok: true,
      intel,
      attachments,
      cached: false,
      messageAr: intel.fallbackNoteAr || 'مسودة أساسية جاهزة.',
    }
  }
}

function heuristicExtract(text: string): MailIntelCache['extract'] {
  const dates = [
    ...text.matchAll(
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|[٠-٩]{1,2}[\/\-][٠-٩]{1,2}[\/\-][٠-٩]{2,4})\b/g
    ),
  ].map((m) => m[0])
  const times = [
    ...text.matchAll(
      /\b(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?|\d{1,2}\s*(صباحاً|مساءً|ص|م))\b/gi
    ),
  ].map((m) => m[0])
  const names = [
    ...text.matchAll(
      /(?:الأستاذ|أ\.|د\.|المهندس|السيد|السيدة|الشيخ)\s+([\u0600-\u06FF\s]{2,40})/g
    ),
  ].map((m) => m[0].trim())
  return {
    dates: [...new Set(dates)].slice(0, 12),
    times: [...new Set(times)].slice(0, 12),
    names: [...new Set(names)].slice(0, 12),
    important: [],
  }
}

export async function askAboutMailMessage(opts: {
  messageId: string
  question: string
}): Promise<{ answerAr: string; messageAr: string }> {
  const q = opts.question.trim()
  if (!q) throw new Error('اكتب سؤالاً عن الرسالة أو المرفقات.')
  const row = await getMessageById(opts.messageId)
  if (!row) throw new Error('الرسالة غير موجودة.')

  let intel = parseIntel(row)
  if (!intel) {
    const analyzed = await analyzeMailMessage(opts.messageId)
    intel = analyzed.intel
  }
  const attachments = parseAttachments(row)
  const attCtx = attachmentsContextText(attachments)

  try {
    const { text } = await generateText({
      model: getHarnessModel(modelSlug()),
      system:
        'أجب بالعربية الفصحى باختصار ودقة اعتماداً فقط على سياق الرسالة والمرفقات المعطى. إن نقصت المعلومة قل ذلك صراحة.',
      prompt: `السؤال: ${q}

الملخص: ${intel.summaryAr}
الموضوع: ${row.subject}
من: ${row.from_addr}
النص:
${(row.body_text || '').slice(0, 14_000)}

${attCtx ? `المرفقات:\n${attCtx.slice(0, 10_000)}` : ''}

الاستخراج:
${JSON.stringify(intel.extract, null, 2)}`,
    })
    return {
      answerAr: text.trim(),
      messageAr: 'إجابة مبنية على الرسالة والمرفقات.',
    }
  } catch (e) {
    const hay = `${row.body_text}\n${attCtx}\n${intel.summaryAr}`.toLowerCase()
    const hit = hay.includes(q.toLowerCase())
    return {
      answerAr: hit
        ? `وُجدت إشارة لسؤالك في نص الرسالة/المرفقات. الملخص: ${intel.summaryAr}`
        : `تعذّر تشغيل الوكيل الآن. الملخص المتاح: ${intel.summaryAr}`,
      messageAr:
        e instanceof Error ? e.message : 'تعذّر السؤال عن الرسالة.',
    }
  }
}

export type RelatedHit = {
  kind: 'file' | 'room_post' | 'mail_thread' | 'memory'
  titleAr: string
  snippet: string
  href?: string
  scopeId?: string
  fileId?: string
  messageId?: string
}

function tokensFromMail(row: ImapMessageRow, atts: MailAttachmentMeta[]): string[] {
  const names = atts.map((a) => a.filename.replace(/\.[^.]+$/, ''))
  const subj = (row.subject || '')
    .replace(/^(re|fw|fwd|رد|إعادة)\s*:/gi, '')
    .trim()
  const parts = [
    ...names,
    ...subj.split(/[\s\-_|/\\,،]+/).filter((t) => t.length >= 3),
    ...((parseIntel(row)?.extract.names || []).slice(0, 4)),
  ]
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))].slice(0, 12)
}

export async function findRelatedForMail(
  messageId: string
): Promise<{ hits: RelatedHit[]; messageAr: string }> {
  const row = await getMessageById(messageId)
  if (!row) throw new Error('الرسالة غير موجودة.')
  const atts = parseAttachments(row)
  const tokens = tokensFromMail(row, atts)
  const hits: RelatedHit[] = []

  // Same mail thread
  if (row.in_reply_to || row.message_id) {
    const siblings = await listMessages({ limit: 40 })
    for (const m of siblings) {
      if (m.id === row.id) continue
      const sameThread =
        (row.message_id &&
          (m.in_reply_to === row.message_id ||
            m.message_id === row.in_reply_to)) ||
        (row.in_reply_to && m.in_reply_to === row.in_reply_to)
      if (sameThread) {
        hits.push({
          kind: 'mail_thread',
          titleAr: m.subject || '(بدون موضوع)',
          snippet: m.snippet?.slice(0, 140) || m.from_addr,
          href: `/?section=mail&msg=${encodeURIComponent(m.id)}`,
          messageId: m.id,
        })
      }
    }
  }

  const sb = getSupabaseAdmin()
  if (sb && tokens.length) {
    for (const token of tokens.slice(0, 6)) {
      const like = `%${token.replace(/%/g, '')}%`
      const { data: files } = await sb
        .from('workspace_files')
        .select('id, scope_id, original_name, mime_type, created_at')
        .ilike('original_name', like)
        .limit(8)
      for (const f of files || []) {
        if (hits.some((h) => h.fileId === f.id)) continue
        hits.push({
          kind: 'file',
          titleAr: String(f.original_name),
          snippet: `ملف في الغرفة · ${f.mime_type || ''}`,
          scopeId: String(f.scope_id),
          fileId: String(f.id),
          href: `/?section=files&fileId=${encodeURIComponent(String(f.id))}&scopeId=${encodeURIComponent(String(f.scope_id))}`,
        })
      }

      const { data: posts } = await sb
        .from('room_posts')
        .select('id, scope_id, body, created_at')
        .ilike('body', like)
        .order('created_at', { ascending: false })
        .limit(6)
      for (const p of posts || []) {
        const body = String(p.body || '')
        hits.push({
          kind: 'room_post',
          titleAr: 'منشور في غرفة الفريق',
          snippet: body.slice(0, 160),
          scopeId: String(p.scope_id || PRIMARY_TEAM_SCOPE_ID),
          href: `/?section=chats&scopeId=${encodeURIComponent(String(p.scope_id || PRIMARY_TEAM_SCOPE_ID))}`,
        })
      }
    }

    try {
      const { data: mems } = await sb
        .from('room_memories')
        .select('id, scope_id, content')
        .ilike('content', `%${tokens[0].replace(/%/g, '')}%`)
        .limit(5)
      for (const m of mems || []) {
        hits.push({
          kind: 'memory',
          titleAr: 'ذاكرة الغرفة',
          snippet: String(m.content || '').slice(0, 160),
          scopeId: String(m.scope_id),
          href: `/?section=chats&scopeId=${encodeURIComponent(String(m.scope_id))}`,
        })
      }
    } catch {
      /* table may differ */
    }
  }

  // Filename-only local list fallback via listWorkspaceFiles
  if (!hits.some((h) => h.kind === 'file') && atts.length) {
    try {
      const { listWorkspaceFiles } = await import('@/lib/documents/workspace')
      const files = await listWorkspaceFiles(PRIMARY_TEAM_SCOPE_ID)
      for (const att of atts) {
        const base = att.filename.toLowerCase()
        const match = files.find(
          (f) =>
            f.originalName.toLowerCase() === base ||
            f.originalName.toLowerCase().includes(base.replace(/\.[^.]+$/, ''))
        )
        if (match) {
          hits.push({
            kind: 'file',
            titleAr: match.originalName,
            snippet: 'وُجد في ملفات غرفة الفريق',
            scopeId: PRIMARY_TEAM_SCOPE_ID,
            fileId: match.id,
            href: `/?section=files&fileId=${encodeURIComponent(match.id)}`,
          })
        }
      }
    } catch {
      /* ignore */
    }
  }

  const deduped = hits.slice(0, 20)
  return {
    hits: deduped,
    messageAr: deduped.length
      ? `وُجد ${deduped.length} رابط/ملف ذو صلة (أفضل جهد).`
      : 'لم يُعثر على ملف أو محادثة مرتبطة بوضوح — جرّب البحث اليدوي في الملفات.',
  }
}
