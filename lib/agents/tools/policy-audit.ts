/**
 * Fill association «تدقيق» Excel templates from Drive/brain knowledge.
 */
import { searchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import {
  findDriveBrainFile,
  downloadDriveFile,
} from '@/lib/google/drive'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'

const AUDIT_NAME_RE = /تدقيق|audit|policy|سياسة|لائحة|خصوصية|موارد|مالية/i

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object' && v && 'text' in (v as object)) {
    return String((v as { text?: string }).text || '')
  }
  if (typeof v === 'object' && v && 'result' in (v as object)) {
    return String((v as { result?: unknown }).result ?? '')
  }
  return String(v)
}

type ExcelWorkbook = {
  xlsx: { load: (b: Buffer) => Promise<void>; writeBuffer: () => Promise<ArrayBuffer> }
  worksheets: Array<{
    name: string
    rowCount: number
    getRow: (n: number) => {
      actualCellCount: number
      getCell: (n: number) => { value: unknown }
      commit?: () => void
    }
  }>
  addWorksheet: (n: string) => { addRow: (v: unknown[]) => void }
}

async function openWorkbook(buffer: Buffer): Promise<ExcelWorkbook> {
  const mod = (await import('exceljs')) as unknown as {
    Workbook?: new () => ExcelWorkbook
    default?: { Workbook: new () => ExcelWorkbook }
  }
  const Workbook = mod.Workbook || mod.default?.Workbook
  if (!Workbook) throw new Error('exceljs.Workbook unavailable')
  const wb = new Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

async function loadAuditWorkbook(opts: {
  scopeId: string
  userId?: string
  templateName?: string
  fileId?: string
}): Promise<{
  buffer: Buffer
  name: string
  mimeType: string
  source: string
}> {
  const scopeId = opts.scopeId
  if (opts.fileId) {
    const found = await findWorkspaceFile(scopeId, opts.fileId)
    if (!found) throw new Error(`لم يُعثر على القالب «${opts.fileId}».`)
    const hit = await readWorkspaceFile(scopeId, found.id)
    return {
      buffer: hit.buffer,
      name: hit.meta.originalName,
      mimeType: hit.meta.mimeType,
      source: 'workspace',
    }
  }

  const files = await listWorkspaceFiles(scopeId)
  const hint = (opts.templateName || '').trim()
  const local = files.find((f) =>
    /\.xlsx?$/i.test(f.originalName) &&
    (hint
      ? f.originalName.includes(hint)
      : AUDIT_NAME_RE.test(f.originalName))
  )
  if (local) {
    const hit = await readWorkspaceFile(scopeId, local.id)
    return {
      buffer: hit.buffer,
      name: hit.meta.originalName,
      mimeType: hit.meta.mimeType,
      source: 'workspace',
    }
  }

  const userId = opts.userId?.trim()
  if (userId && userId !== 'engine' && userId !== 'local-owner') {
    for (const q of [hint, 'نموذج تدقيق', 'تدقيق سياسة', 'تدقيق اللائحة', 'تدقيق'].filter(Boolean)) {
      const meta = await findDriveBrainFile(userId, q)
      if (meta && /\.xlsx?$/i.test(meta.name)) {
        const dl = await downloadDriveFile(userId, meta)
        return {
          buffer: dl.buffer,
          name: dl.filename || meta.name,
          mimeType: dl.mimeType,
          source: 'drive',
        }
      }
    }
  }

  throw new Error(
    'لم يُعثر على قالب تدقيق Excel. ارفع نموذجاً باسم يحتوي «تدقيق» أو افتحه من Drive أولاً.'
  )
}

export async function executeFillPolicyAudit(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const userId = String(params.userId || '').trim()
  const topicAr = String(params.topicAr || params.queryAr || 'سياسة الجمعية').trim()
  const templateName = params.templateName
    ? String(params.templateName)
    : undefined
  const fileId = params.fileId ? String(params.fileId) : undefined

  const loaded = await loadAuditWorkbook({
    scopeId,
    userId,
    templateName,
    fileId,
  })

  const knowledge = await searchKnowledgeBase({
    queryAr: topicAr,
    scopeId,
    limit: 8,
    source: 'drive',
  })

  const wb = await openWorkbook(loaded.buffer)
  const snippets = knowledge.documents.map((d) => d.excerpt).filter(Boolean)
  let fillIdx = 0
  let filledCells = 0
  const notes: string[] = []

  for (const ws of wb.worksheets) {
    const header = ws.getRow(1)
    let evidenceCol = 0
    let statusCol = 0
    const maxCol = Math.max(header.actualCellCount || 0, 8)
    for (let c = 1; c <= maxCol; c++) {
      const h = cellText(header.getCell(c).value)
      if (/واقع|ملاحظة|دليل|شاهد|evidence|finding|تعليق|نص/i.test(h)) {
        evidenceCol = c
      }
      if (/حالة|مطابق|status|تقييم|نتيجة/i.test(h)) {
        statusCol = c
      }
    }
    if (!evidenceCol) evidenceCol = Math.min(maxCol + 1, 4)
    if (!statusCol) statusCol = evidenceCol === 3 ? 4 : evidenceCol + 1

    const rowCount = Math.max(ws.rowCount || 0, 2)
    for (let r = 2; r <= Math.min(rowCount, 80); r++) {
      const row = ws.getRow(r)
      const label =
        cellText(row.getCell(1).value) || cellText(row.getCell(2).value)
      if (!label.trim()) continue
      const evCell = row.getCell(evidenceCol)
      const stCell = row.getCell(statusCol)
      if (cellText(evCell.value).trim()) continue

      const snippet =
        snippets[fillIdx % Math.max(snippets.length, 1)] ||
        `يُراجع بند «${label}» وفق معرفة الجمعية (${topicAr}).`
      fillIdx += 1
      evCell.value = String(snippet).slice(0, 500)
      if (!cellText(stCell.value).trim()) {
        stCell.value =
          knowledge.count > 0 ? 'مسودة من العقل — للمراجعة' : 'يحتاج مراجعة بشرية'
      }
      row.commit?.()
      filledCells += 1
      notes.push(`${ws.name}!R${r}: ${label.slice(0, 40)}`)
    }
  }

  if (filledCells === 0 && knowledge.count > 0) {
    const summary = wb.addWorksheet('ملخص من العقل')
    summary.addRow(['الموضوع', topicAr])
    summary.addRow(['مصادر من العقل', knowledge.count])
    for (const d of knowledge.documents.slice(0, 6)) {
      summary.addRow([d.titleAr, d.excerpt.slice(0, 400)])
    }
    filledCells = knowledge.documents.length
    notes.push('أُضيفت ورقة «ملخص من العقل»')
  }

  const outBuf = Buffer.from(await wb.xlsx.writeBuffer())
  const existing = await listWorkspaceFiles(scopeId)
  const next = nextVersionFileName(
    loaded.name.replace(/\.xlsx?$/i, '') + '-معبّأ.xlsx',
    existing.map((f) => f.originalName)
  )
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: outBuf,
    originalName: next.fileName,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    templateName: loaded.name,
    templateSource: loaded.source,
    filledCells,
    knowledgeHits: knowledge.count,
    topicAr,
    notes: notes.slice(0, 20),
    citationBlockAr: knowledge.citationBlockAr,
    downloadPath,
    attachments: [
      {
        fileId: saved.file.id,
        name: saved.file.originalName,
        mimeType: saved.file.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr:
      filledCells > 0
        ? `عُبئ نموذج التدقيق «${loaded.name}» من معرفة العقل (${filledCells} خلية/سطر) — راجع الملف ثم اعتمد بشرياً.`
        : `جُهّز ملف تدقيق من «${loaded.name}». لم تُملأ خلايا تلقائياً — راجع الملخص.`,
  }
}
