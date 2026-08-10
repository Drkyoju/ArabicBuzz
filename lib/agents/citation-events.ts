import type { RoomCitation } from '@/lib/scopes/types'
import {
  mapToolErrorAr,
  mapToolSuccessAr,
  toolLabelAr,
} from '@/lib/ai/user-error-ar'

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

function summarizeToolOutput(name: string, out: unknown): string {
  if (out == null) return mapToolSuccessAr(name, null)
  if (typeof out === 'string') {
    const t = out.replace(/\s+/g, ' ').trim()
    if (!t) return mapToolSuccessAr(name, null)
    // Only sanitize when the string looks like an error / technical dump.
    if (
      /error|fail|refuse|tounicode|extract_source|unknown tool|تعذّر|فشل|خطأ/i.test(
        t
      )
    ) {
      return mapToolErrorAr(t).slice(0, 100)
    }
    return mapToolSuccessAr(name, t)
  }
  if (typeof out !== 'object') {
    return mapToolErrorAr(String(out)).slice(0, 100)
  }
  const o = out as Record<string, unknown>
  const nested =
    o.output && typeof o.output === 'object'
      ? (o.output as Record<string, unknown>)
      : o
  if (nested.status === 'paused' && nested.approvalId) {
    return mapToolSuccessAr(name, 'بانتظار موافقة')
  }
  const ok = nested.ok === true || nested.ok === 'true'
  if (nested.ok === false) {
    if (typeof nested.messageAr === 'string' && nested.messageAr.trim()) {
      return mapToolErrorAr(nested.messageAr).slice(0, 100)
    }
    if (typeof nested.reason_ar === 'string' && nested.reason_ar.trim()) {
      return mapToolErrorAr(nested.reason_ar).slice(0, 100)
    }
    if (typeof nested.error === 'string' && nested.error.trim()) {
      return mapToolErrorAr(nested.error).slice(0, 100)
    }
  }
  if (typeof nested.messageAr === 'string' && nested.messageAr.trim()) {
    const msg = nested.messageAr.trim()
    if (ok || nested.ok !== false) return mapToolSuccessAr(name, msg)
    return mapToolErrorAr(msg).slice(0, 100)
  }
  if (typeof nested.reason_ar === 'string' && nested.reason_ar.trim()) {
    return mapToolErrorAr(nested.reason_ar).slice(0, 100)
  }
  if (typeof nested.error === 'string' && nested.error.trim()) {
    return mapToolErrorAr(nested.error).slice(0, 100)
  }
  if (typeof nested.message === 'string' && nested.message.trim()) {
    const msg = nested.message.trim()
    if (ok) return mapToolSuccessAr(name, msg)
    return mapToolErrorAr(msg).slice(0, 100)
  }
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
      return mapToolSuccessAr(name, null, { count: arr.length })
    }
  }
  if (typeof nested.count === 'number') {
    return mapToolSuccessAr(name, null, { count: nested.count })
  }
  if (typeof nested.id === 'string' || typeof nested.messageId === 'string') {
    return mapToolSuccessAr(name, 'تم')
  }
  if (name === 'send_message' && (nested.ok === true || nested.sent === true)) {
    return mapToolSuccessAr(name, 'أُرسلت')
  }
  return mapToolSuccessAr(name, null)
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
          labelAr: toolLabelAr(name),
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
          !usedTools.some((u) => u.name === name && u.summaryAr === mapToolSuccessAr(name, null))
        ) {
          const already = usedTools.some((u) => u.name === name)
          if (!already) {
            usedTools.push({
              name,
              labelAr: toolLabelAr(name),
              summaryAr: mapToolSuccessAr(name, null),
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
