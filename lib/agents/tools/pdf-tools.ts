import {
  buildPdfFromText,
  fillPdfForm,
  listPdfFormFields,
  mergePdfs,
  stampPdf,
} from '@/lib/documents/pdf'
import {
  findWorkspaceFile,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'

function scopeOf(p: Record<string, unknown>) {
  return String(p.scopeId || 'shared-demo')
}

async function loadPdfBuffer(scopeId: string, ref: string) {
  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) throw new Error(`لم يُعثر على PDF «${ref}»`)
  const hit = await readWorkspaceFile(scopeId, found.id)
  return { hit, found }
}

function downloadMeta(
  scopeId: string,
  file: { id: string; originalName: string; mimeType: string; size: number },
  messageAr: string
) {
  const downloadPath = `/api/storage/file?id=${encodeURIComponent(file.id)}&scopeId=${encodeURIComponent(scopeId)}`
  return {
    ok: true,
    fileId: file.id,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    downloadPath,
    downloadUrl: downloadPath,
    attachments: [
      {
        fileId: file.id,
        name: file.originalName,
        mimeType: file.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr,
  }
}

export async function executePdfCreate(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const buffer = await buildPdfFromText({
    title: params.title ? String(params.title) : undefined,
    body: params.body ? String(params.body) : undefined,
    paragraphs: Array.isArray(params.paragraphs)
      ? params.paragraphs.map(String)
      : undefined,
  })
  const name = String(params.outputName || params.filename || 'مستند.pdf')
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer,
    originalName: name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`,
    mimeType: 'application/pdf',
  })
  return downloadMeta(
    scopeId,
    saved.file,
    `أُنشئ PDF «${saved.file.originalName}» في ملفات الغرفة.`
  )
}

export async function executePdfStamp(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ref = String(params.fileId || params.path || '').trim()
  if (!ref) throw new Error('مرّر fileId لملف PDF')
  const { hit } = await loadPdfBuffer(scopeId, ref)
  const buffer = await stampPdf({
    pdf: hit.buffer,
    text: String(params.text || params.stampAr || ''),
    pageIndex:
      typeof params.pageIndex === 'number' ? params.pageIndex : undefined,
    x: typeof params.x === 'number' ? params.x : undefined,
    y: typeof params.y === 'number' ? params.y : undefined,
    size: typeof params.size === 'number' ? params.size : undefined,
  })
  const base = hit.meta.originalName.replace(/\.pdf$/i, '')
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer,
    originalName: String(params.outputName || `${base}-ختم.pdf`),
    mimeType: 'application/pdf',
  })
  return downloadMeta(
    scopeId,
    saved.file,
    `وُضع ختم نصي على «${saved.file.originalName}».`
  )
}

export async function executePdfMerge(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ids = Array.isArray(params.fileIds)
    ? params.fileIds.map(String)
    : String(params.fileIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  if (ids.length < 2) throw new Error('مرّر fileIds (ملفين فأكثر) للدمج')
  const buffers = []
  for (const id of ids) {
    const { hit } = await loadPdfBuffer(scopeId, id)
    buffers.push(hit.buffer)
  }
  const buffer = await mergePdfs(buffers)
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer,
    originalName: String(params.outputName || 'مدمج.pdf'),
    mimeType: 'application/pdf',
  })
  return downloadMeta(scopeId, saved.file, `دُمجت ${ids.length} ملفات PDF.`)
}

export async function executePdfListFields(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ref = String(params.fileId || params.path || '').trim()
  if (!ref) throw new Error('مرّر fileId')
  const { hit } = await loadPdfBuffer(scopeId, ref)
  const fields = await listPdfFormFields(hit.buffer)
  return {
    ok: true,
    fileId: hit.meta.id,
    count: fields.length,
    fields,
    messageAr:
      fields.length > 0
        ? `عُثر على ${fields.length} حقل نموذج — عبّئها بـ pdf_fill_form.`
        : 'لا حقول نموذج في هذا الملف — استخدم pdf_stamp أو pdf_create.',
  }
}

export async function executePdfFillForm(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ref = String(params.fileId || params.path || '').trim()
  if (!ref) throw new Error('مرّر fileId')
  const { hit } = await loadPdfBuffer(scopeId, ref)
  const raw = (params.fields || {}) as Record<string, unknown>
  const fields: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean') fields[k] = v
    else fields[k] = String(v ?? '')
  }
  const buffer = await fillPdfForm({
    pdf: hit.buffer,
    fields,
    flatten: Boolean(params.flatten),
  })
  const base = hit.meta.originalName.replace(/\.pdf$/i, '')
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer,
    originalName: String(params.outputName || `${base}-معبّأ.pdf`),
    mimeType: 'application/pdf',
  })
  return downloadMeta(
    scopeId,
    saved.file,
    `عُبّئ نموذج PDF «${saved.file.originalName}».`
  )
}
