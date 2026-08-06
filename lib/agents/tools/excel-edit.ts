/**
 * In-place Excel cell edits (preserve workbook structure via exceljs).
 */
import ExcelJS from 'exceljs'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'

type CellPatch = {
  /** A1 like B12, or row+col (1-based) */
  cell?: string
  row?: number
  col?: number
  value: string | number | boolean | null
  sheet?: string
}

function parseA1(a1: string): { row: number; col: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(a1.trim())
  if (!m) return null
  const letters = m[1].toUpperCase()
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return { row: Number(m[2]), col }
}

function resolveSheet(
  wb: ExcelJS.Workbook,
  name?: string
): ExcelJS.Worksheet {
  if (name) {
    const hit =
      wb.getWorksheet(name) ||
      wb.worksheets.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      )
    if (hit) return hit
  }
  const first = wb.worksheets[0]
  if (!first) throw new Error('ملف Excel بلا أوراق.')
  return first
}

export async function executeEditExcel(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.name || '').trim()
  if (!ref) throw new Error('مرّر fileId لملف Excel.')

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) {
    throw new Error(`لم يُعثر على «${ref}». استخدم list_workspace_files.`)
  }
  if (!/\.xlsx?$/i.test(found.originalName)) {
    throw new Error('edit_excel يعمل على ملفات .xlsx/.xls فقط.')
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  const wb = new ExcelJS.Workbook()
  // exceljs typings conflict with Node Buffer generics
  await wb.xlsx.load(hit.buffer as never)

  const patchesRaw = Array.isArray(params.cells)
    ? params.cells
    : Array.isArray(params.patches)
      ? params.patches
      : null
  if (!patchesRaw?.length) {
    throw new Error(
      'مرّر cells: [{ cell:"B2", value:"..." }] أو { row, col, value }.'
    )
  }

  const defaultSheet =
    params.sheet != null ? String(params.sheet) : undefined
  let applied = 0
  for (const raw of patchesRaw) {
    const p = (raw || {}) as CellPatch
    const sheet = resolveSheet(wb, p.sheet || defaultSheet)
    let row = p.row
    let col = p.col
    if (p.cell) {
      const parsed = parseA1(String(p.cell))
      if (!parsed) throw new Error(`عنوان خلية غير صالح: ${p.cell}`)
      row = parsed.row
      col = parsed.col
    }
    if (!row || !col) {
      throw new Error('كل تعديل يحتاج cell (مثل B2) أو row+col.')
    }
    sheet.getCell(row, col).value =
      p.value === null || p.value === undefined ? null : (p.value as ExcelJS.CellValue)
    applied++
  }

  const replaceSource = Boolean(params.replaceSource)
  const existing = await listWorkspaceFiles(scopeId)
  let outputName = String(params.outputName || '').trim()
  let versionTag: string | null = null
  if (replaceSource) {
    outputName = outputName || found.originalName
  } else if (!outputName) {
    const next = nextVersionFileName(
      found.originalName,
      existing.map((f) => f.originalName)
    )
    outputName = next.fileName
    versionTag = next.versionTag
  }

  const outBuf = Buffer.from(await wb.xlsx.writeBuffer())
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: outBuf,
    originalName: outputName.endsWith('.xlsx')
      ? outputName
      : `${outputName.replace(/\.xls$/i, '')}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    replaceId: replaceSource ? found.id : undefined,
  })

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    cellsUpdated: applied,
    versionTag,
    replaced: replaceSource,
    downloadPath,
    downloadUrl: downloadPath,
    attachments: [
      {
        fileId: saved.file.id,
        name: saved.file.originalName,
        mimeType: saved.file.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr: `عُدّلت ${applied} خلية في «${saved.file.originalName}» — جاهز للتنزيل في الشات.`,
  }
}

/** Read sheet preview as rows (for agent planning before edit_excel). */
export async function executeReadExcel(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.name || '').trim()
  if (!ref) throw new Error('مرّر fileId.')

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) throw new Error(`لم يُعثر على «${ref}».`)
  const hit = await readWorkspaceFile(scopeId, found.id)
  const wb = new ExcelJS.Workbook()
  // exceljs typings conflict with Node Buffer generics
  await wb.xlsx.load(hit.buffer as never)

  const sheet = resolveSheet(
    wb,
    params.sheet != null ? String(params.sheet) : undefined
  )
  const maxRows = Math.min(
    Number(params.maxRows) > 0 ? Number(params.maxRows) : 40,
    80
  )
  const maxCols = Math.min(
    Number(params.maxCols) > 0 ? Number(params.maxCols) : 12,
    26
  )

  const rows: Array<Array<string | number | boolean | null>> = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > maxRows) return
    const cells: Array<string | number | boolean | null> = []
    for (let c = 1; c <= maxCols; c++) {
      const v = row.getCell(c).value
      if (v == null) cells.push(null)
      else if (typeof v === 'object' && v !== null && 'text' in v) {
        cells.push(String((v as { text?: string }).text || ''))
      } else if (typeof v === 'object' && v !== null && 'result' in v) {
        cells.push(
          (v as { result?: string | number | boolean }).result ?? null
        )
      } else if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        cells.push(v)
      } else {
        cells.push(String(v))
      }
    }
    rows.push(cells)
  })

  return {
    ok: true,
    fileId: found.id,
    name: found.originalName,
    sheet: sheet.name,
    sheetNames: wb.worksheets.map((s) => s.name),
    rows,
    messageAr: `قُرئت ورقة «${sheet.name}» (${rows.length} صف). عدّل بـ edit_excel ثم أعد الملف في الشات.`,
  }
}
