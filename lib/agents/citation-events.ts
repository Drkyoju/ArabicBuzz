import type { RoomCitation } from '@/lib/scopes/types'

type DocLike = {
  citation?: string
  titleAr?: string
  excerpt?: string
  url?: string
  metadata?: { url?: string; sourceUrl?: string }
}

/** Pull RAG citation chips from a tool output object (any nesting). */
export function extractCitationsFromToolOutput(
  toolOut: unknown
): RoomCitation[] {
  if (!toolOut || typeof toolOut !== 'object') return []
  const out = toolOut as Record<string, unknown>
  const nested =
    out.output && typeof out.output === 'object'
      ? (out.output as Record<string, unknown>)
      : out
  const docs = (nested.documents || out.documents) as DocLike[] | undefined
  if (!Array.isArray(docs)) return []
  const citations: RoomCitation[] = []
  for (const d of docs) {
    const label =
      d.citation || (d.titleAr ? `[مصدر: ${d.titleAr}]` : '') || ''
    const url = d.url || d.metadata?.url || d.metadata?.sourceUrl || undefined
    if (label && !citations.some((c) => c.labelAr === label)) {
      citations.push({ labelAr: label, excerpt: d.excerpt, url })
    }
  }
  return citations
}

export function extractPausedApprovalId(toolOut: unknown): string | null {
  if (!toolOut || typeof toolOut !== 'object') return null
  const out = toolOut as Record<string, unknown>
  const nested =
    out.output && typeof out.output === 'object'
      ? (out.output as Record<string, unknown>)
      : out
  if (nested.status === 'paused' && typeof nested.approvalId === 'string') {
    return nested.approvalId
  }
  return null
}

const TOOL_LABEL_AR: Record<string, string> = {
  gmail_search: 'بحث Gmail',
  gmail_read: 'قراءة رسالة',
  gmail_send: 'إرسال بريد',
  calendar_list_events: 'تقويم Google',
  calendar_create_event: 'إنشاء موعد Google',
  calendar_scan_email: 'مسح بريد للمواعيد',
  room_calendar_list: 'تقويم الغرفة',
  room_calendar_create: 'إضافة موعد غرفة',
  room_tasks_list: 'مهام الغرفة',
  room_memory_list: 'ذاكرة الغرفة',
  memory_search: 'بحث الذاكرة',
  search_knowledge_base: 'قاعدة المعرفة',
  list_workspace_files: 'قائمة الملفات',
  list_files: 'قائمة الملفات',
  read_file: 'قراءة ملف',
  read_document: 'قراءة مستند',
  brain_open_document: 'فتح مستند العقل',
  send_message: 'تيليجرام',
  notify_room_member: 'تبليغ عضو',
  web_search: 'بحث ويب',
  web_fetch: 'جلب صفحة',
  research_task_tools: 'بحث أدوات/مهارات',
  drive_search_files: 'بحث Drive',
  drive_list_files: 'قائمة Drive',
  drive_get_link: 'رابط Drive',
  room_search: 'بحث الغرفة',
  pdf_annotate: 'تعليق PDF',
  pdf_merge: 'دمج PDF',
  arabic_ocr: 'OCR عربي',
}

function summarizeToolOutput(name: string, out: unknown): string {
  if (out == null) return 'تم الاستدعاء'
  if (typeof out === 'string') {
    const t = out.replace(/\s+/g, ' ').trim()
    return t ? t.slice(0, 140) : 'تم الاستدعاء'
  }
  if (typeof out !== 'object') return String(out).slice(0, 140)
  const o = out as Record<string, unknown>
  const nested =
    o.output && typeof o.output === 'object'
      ? (o.output as Record<string, unknown>)
      : o
  if (nested.status === 'paused' && nested.approvalId) {
    return 'بانتظار موافقة بشرية'
  }
  if (typeof nested.error === 'string') return `خطأ: ${nested.error.slice(0, 100)}`
  if (typeof nested.messageAr === 'string') return nested.messageAr.slice(0, 140)
  if (typeof nested.message === 'string') return nested.message.slice(0, 140)
  for (const key of [
    'events',
    'messages',
    'items',
    'tasks',
    'files',
    'documents',
    'results',
    'memories',
  ] as const) {
    const arr = nested[key]
    if (Array.isArray(arr)) {
      const label =
        key === 'events'
          ? 'موعد'
          : key === 'messages'
            ? 'رسالة'
            : key === 'tasks'
              ? 'مهمة'
              : key === 'files'
                ? 'ملف'
                : key === 'documents'
                  ? 'مستند'
                  : key === 'memories'
                    ? 'ذكرى'
                    : 'عنصر'
      return arr.length === 0
        ? `لا ${label === 'عنصر' ? 'نتائج' : label + 'ات'}`
        : `${arr.length} ${label}${arr.length > 1 && label !== 'عنصر' ? '' : ''}`
    }
  }
  if (typeof nested.count === 'number') return `${nested.count} نتيجة`
  if (typeof nested.id === 'string' || typeof nested.messageId === 'string') {
    return 'تم بنجاح'
  }
  if (name === 'send_message' && (nested.ok === true || nested.sent === true)) {
    return 'أُرسلت رسالة تيليجرام'
  }
  return 'تم الاستدعاء'
}

export type UsedToolCall = {
  name: string
  labelAr: string
  summaryAr: string
}

export type StepAttachmentRef = {
  fileId: string
  name: string
  mimeType?: string
  scopeId?: string
  /** Tool that produced this attachment (Telegram silent delivery filter). */
  toolName?: string
}

function pushStepAttachment(
  bucket: StepAttachmentRef[],
  out: unknown,
  toolName?: string
) {
  if (!out || typeof out !== 'object') return
  const o = out as Record<string, unknown>
  const add = (raw: Record<string, unknown>) => {
    const fileId = String(raw.fileId || raw.id || '').trim()
    const name = String(
      raw.name || raw.originalName || raw.filename || ''
    ).trim()
    if (!fileId || !name) return
    if (bucket.some((x) => x.fileId === fileId)) return
    bucket.push({
      fileId,
      name,
      mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
      scopeId: raw.scopeId ? String(raw.scopeId) : undefined,
      toolName: toolName || undefined,
    })
  }
  if (Array.isArray(o.attachments)) {
    for (const a of o.attachments) {
      if (a && typeof a === 'object') add(a as Record<string, unknown>)
    }
  }
  if (o.fileId && (o.name || o.originalName || o.downloadPath)) {
    add(o)
  }
}

/** Walk generateText / streamText step tool results. */
export function extractFromAgentSteps(steps: unknown): {
  citations: RoomCitation[]
  pendingApprovalIds: string[]
  usedTools: UsedToolCall[]
  attachments: StepAttachmentRef[]
} {
  const citations: RoomCitation[] = []
  const pendingApprovalIds: string[] = []
  const usedTools: UsedToolCall[] = []
  const attachments: StepAttachmentRef[] = []
  if (!Array.isArray(steps)) {
    return { citations, pendingApprovalIds, usedTools, attachments }
  }

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    const s = step as Record<string, unknown>
    const toolResults = (s.toolResults || s.content) as unknown
    const list = Array.isArray(toolResults) ? toolResults : []
    for (const tr of list) {
      if (!tr || typeof tr !== 'object') continue
      const row = tr as Record<string, unknown>
      const out = row.output ?? row.result ?? row
      const name = String(
        row.toolName ||
          row.name ||
          (row.type === 'tool-result' && row.toolName) ||
          ''
      ).trim()
      if (name && name !== 'undefined') {
        usedTools.push({
          name,
          labelAr: TOOL_LABEL_AR[name] || name,
          summaryAr: summarizeToolOutput(name, out),
        })
      }
      for (const c of extractCitationsFromToolOutput(out)) {
        if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
      }
      const aid = extractPausedApprovalId(out)
      if (aid && !pendingApprovalIds.includes(aid)) pendingApprovalIds.push(aid)
      pushStepAttachment(
        attachments,
        out,
        name && name !== 'undefined' ? name : undefined
      )
    }

    // Fallback: toolCalls without paired results still count as used
    const calls = s.toolCalls
    if (Array.isArray(calls)) {
      for (const c of calls) {
        if (!c || typeof c !== 'object') continue
        const row = c as Record<string, unknown>
        const name = String(row.toolName || row.name || '').trim()
        if (
          name &&
          !usedTools.some((u) => u.name === name && u.summaryAr === 'تم الاستدعاء')
        ) {
          const already = usedTools.some((u) => u.name === name)
          if (!already) {
            usedTools.push({
              name,
              labelAr: TOOL_LABEL_AR[name] || name,
              summaryAr: 'تم الاستدعاء',
            })
          }
        }
      }
    }
  }
  return { citations, pendingApprovalIds, usedTools, attachments }
}

/** Format citations as Telegram / plain-text footer. */
export function formatCitationsFooterAr(citations: RoomCitation[]): string {
  if (!citations.length) return ''
  const lines = citations.map((c, i) => {
    const base = `${i + 1}. ${c.labelAr}`
    if (c.url) return `${base}\n   ${c.url}`
    if (c.excerpt) return `${base}\n   ${c.excerpt.slice(0, 160)}`
    return base
  })
  return `\n\n📚 المصادر:\n${lines.join('\n')}`
}
