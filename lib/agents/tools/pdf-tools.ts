import {
  buildPdfFromText,
  fillPdfForm,
  listPdfFormFields,
  mergePdfs,
  stampPdf,
} from '@/lib/documents/pdf'
import { replacePdfText } from '@/lib/documents/pdf-replace'
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
  messageAr: string,
  edited = true
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
        edited,
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
    `أُنشئ PDF «${saved.file.originalName}» في ملفات الغرفة.`,
    false
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
    markEdited: true,
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
    markEdited: true,
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
    markEdited: true,
  })
  return downloadMeta(
    scopeId,
    saved.file,
    `عُبّئ نموذج PDF «${saved.file.originalName}».`
  )
}

/**
 * In-place Arabic/Latin text replace with HarfBuzz shaping (PyMuPDF).
 * Prefer this over pdf_stamp or rebuild for name/phrase edits.
 */
export async function executePdfReplaceText(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ref = String(params.fileId || params.path || '').trim()
  if (!ref) throw new Error('مرّر fileId لملف PDF')
  const { hit } = await loadPdfBuffer(scopeId, ref)

  const rawList = Array.isArray(params.replacements)
    ? params.replacements
    : params.find
      ? [
          {
            find: params.find,
            replace: params.replace ?? params.to ?? params.with,
          },
        ]
      : []
  const replacements = rawList
    .map((raw) => {
      const r = (raw || {}) as Record<string, unknown>
      return {
        find: String(r.find ?? r.from ?? r.search ?? ''),
        replace: String(r.replace ?? r.to ?? r.with ?? ''),
      }
    })
    .filter((r) => r.find.trim().length > 0)

  if (!replacements.length) {
    throw new Error(
      'مرّر replacements: [{ find, replace }] أو find + replace لاستبدال نص داخل PDF.'
    )
  }

  const result = await replacePdfText({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    replacements,
  })

  if (result.totalReplacements <= 0) {
    throw new Error(
      result.messageAr ||
        'لم يُعثر على النص في طبقة PDF. جرّب صيغة بديلة (مثل عبدهللا بدل عبدالله) أو حوّل إلى Word عبر convert_document.'
    )
  }

  const base = hit.meta.originalName.replace(/\.pdf$/i, '')
  const replaceSource = Boolean(params.replaceSource)
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: result.buffer,
    originalName: String(
      params.outputName || `${base}-معدّل.pdf`
    ),
    mimeType: 'application/pdf',
    replaceId: replaceSource ? hit.meta.id : undefined,
    markEdited: true,
  })

  return {
    ...downloadMeta(
      scopeId,
      saved.file,
      `${result.messageAr} الملف: «${saved.file.originalName}».`
    ),
    engine: result.engine,
    totalReplacements: result.totalReplacements,
    details: result.details,
  }
}

/**
 * Burn structured annotations into a PDF (Telegram/agent equivalent of PDF Expert canvas).
 * Supports text, sticky, textHighlight, rect — not freehand pen UI.
 */
export async function executePdfAnnotate(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const ref = String(params.fileId || params.path || '').trim()
  if (!ref) throw new Error('مرّر fileId لملف PDF')

  const raw: unknown[] = Array.isArray(params.annotations)
    ? [...params.annotations]
    : []
  if (!raw.length) {
    const text = String(params.text || params.noteAr || '').trim()
    if (!text) {
      throw new Error(
        'مرّر annotations[] أو text لتعليق PDF (نص / sticky / تمييز).'
      )
    }
    raw.push({
      kind: String(params.kind || 'sticky'),
      pageIndex: typeof params.pageIndex === 'number' ? params.pageIndex : 0,
      x: typeof params.x === 'number' ? params.x : 0.08,
      y: typeof params.y === 'number' ? params.y : 0.12,
      w: typeof params.w === 'number' ? params.w : 0.35,
      h: typeof params.h === 'number' ? params.h : 0.12,
      text,
      color: String(params.color || '#f5c542'),
      fontSize:
        typeof params.fontSize === 'number' ? params.fontSize : 0.022,
    })
  }

  const { burnPdfAnnotations } = await import('@/lib/documents/pdf-annotate')
  const { loadArabicFontBytes } = await import('@/lib/documents/pdf')

  const annotations: import('@/lib/documents/pdf-annotate').PdfAnnotation[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    const kind = String(a.kind || 'text')
    const pageIndex =
      typeof a.pageIndex === 'number' ? Math.max(0, a.pageIndex) : 0
    const id = String(a.id || `anno-${annotations.length + 1}`)
    const color = String(a.color || '#1a1a1a')
    const x = typeof a.x === 'number' ? a.x : 0.1
    const y = typeof a.y === 'number' ? a.y : 0.1

    if (kind === 'sticky') {
      annotations.push({
        id,
        kind: 'sticky',
        pageIndex,
        x,
        y,
        w: typeof a.w === 'number' ? a.w : 0.32,
        h: typeof a.h === 'number' ? a.h : 0.14,
        text: String(a.text || ''),
        color: String(a.color || '#f5c542'),
        fontSize: typeof a.fontSize === 'number' ? a.fontSize : 0.02,
      })
    } else if (kind === 'textHighlight') {
      annotations.push({
        id,
        kind: 'textHighlight',
        pageIndex,
        x,
        y,
        w: typeof a.w === 'number' ? a.w : 0.4,
        h: typeof a.h === 'number' ? a.h : 0.04,
        color: String(a.color || '#f5c542'),
        opacity: typeof a.opacity === 'number' ? a.opacity : 0.35,
      })
    } else if (kind === 'rect') {
      annotations.push({
        id,
        kind: 'rect',
        pageIndex,
        x,
        y,
        w: typeof a.w === 'number' ? a.w : 0.3,
        h: typeof a.h === 'number' ? a.h : 0.1,
        color,
        fill: a.fill === true,
        opacity: typeof a.opacity === 'number' ? a.opacity : undefined,
      })
    } else {
      annotations.push({
        id,
        kind: 'text',
        pageIndex,
        x,
        y,
        text: String(a.text || ''),
        fontSize: typeof a.fontSize === 'number' ? a.fontSize : 0.025,
        color,
      })
    }
  }

  if (!annotations.length) {
    throw new Error('لا تعليقات صالحة للحرق على PDF.')
  }

  const { hit } = await loadPdfBuffer(scopeId, ref)
  const fontBytes = await loadArabicFontBytes()
  const burned = await burnPdfAnnotations(hit.buffer, annotations, {
    arabicFontBytes: fontBytes,
  })
  const base = hit.meta.originalName.replace(/\.pdf$/i, '')
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: Buffer.from(burned),
    originalName: String(params.outputName || `${base}-معلّق.pdf`),
    mimeType: 'application/pdf',
    markEdited: true,
  })
  return downloadMeta(
    scopeId,
    saved.file,
    `حُرقت ${annotations.length} تعليقات على «${saved.file.originalName}» — أعده بـ return_file.`
  )
}

