import { extractDocumentText } from '@/lib/rag/extract'
import {
  buildDocumentBuffer,
  ensureFilename,
  inferFormatFromName,
  mimeForFormat,
  type DocFormat,
  type SheetSpec,
  type SlideSpec,
} from '@/lib/documents/build'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'
import {
  fillOfficeTemplate,
  patchOfficeOpenXml,
  type TextReplacement,
} from '@/lib/documents/office-patch'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

const TEXT_PREVIEW_MAX = 24_000

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((x) => String(x ?? '')).filter((s) => s.length > 0)
}

function asSheets(v: unknown): SheetSpec[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((raw, i) => {
    const s = (raw || {}) as Record<string, unknown>
    const rows = Array.isArray(s.rows)
      ? s.rows.map((row) =>
          Array.isArray(row)
            ? row.map((c) =>
                c === null || c === undefined
                  ? ''
                  : typeof c === 'number' || typeof c === 'boolean'
                    ? c
                    : String(c)
              )
            : [String(row ?? '')]
        )
      : []
    return {
      name: s.name ? String(s.name) : `Sheet${i + 1}`,
      rows,
    }
  })
}

function asSlides(v: unknown): SlideSpec[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((raw) => {
    const s = (raw || {}) as Record<string, unknown>
    return {
      title: String(s.title || 'شريحة'),
      bullets: asStringArray(s.bullets) || [],
      notes: s.notes ? String(s.notes) : undefined,
    }
  })
}

function asReplacements(v: unknown): TextReplacement[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: TextReplacement[] = []
  for (const raw of v) {
    const r = (raw || {}) as Record<string, unknown>
    const find = String(r.find ?? r.from ?? r.search ?? '')
    if (!find) continue
    out.push({
      find,
      replace: String(r.replace ?? r.to ?? r.with ?? ''),
      all: r.all === undefined ? true : Boolean(r.all),
    })
  }
  return out.length ? out : undefined
}

function asTemplateData(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  return v as Record<string, unknown>
}

export async function executeListWorkspaceFiles(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const files = await listWorkspaceFiles(scopeId)
  return {
    ok: true,
    scopeId,
    count: files.length,
    files: files.slice(0, 80).map((f) => ({
      id: f.id,
      name: f.originalName,
      mimeType: f.mimeType,
      kind: f.kind,
      size: f.size,
      source: f.source,
    })),
    messageAr:
      files.length === 0
        ? 'لا ملفات في هذه المساحة بعد. ارفع من جهازك (Word/Excel/PDF/صور) عبر 📎 في الشات — لا يلزم Drive.'
        : `عُثر على ${files.length} ملفاً في الغرفة — استخدم read_document ثم edit_document / edit_excel، أو return_file للتنزيل.`,
  }
}

export async function executeReadDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.path || params.name || '').trim()
  if (!ref) {
    throw new Error('مرّر fileId أو اسم الملف (path/name).')
  }

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) {
    throw new Error(`لم يُعثر على الملف «${ref}». استخدم list_workspace_files.`)
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  const extracted = await extractDocumentText({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    enableOcr: true,
  })

  const text = extracted.text || ''
  const truncated = text.length > TEXT_PREVIEW_MAX
  const preview = truncated ? `${text.slice(0, TEXT_PREVIEW_MAX)}\n…` : text

  return {
    ok: true,
    fileId: hit.meta.id,
    name: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    source: hit.meta.source,
    extractMethod: extracted.method,
    ocrUsed: extracted.ocrUsed,
    charCount: text.length,
    truncated,
    suggestedFormat: inferFormatFromName(hit.meta.originalName) || 'docx',
    text: preview,
    messageAr: truncated
      ? `قُرئ «${hit.meta.originalName}» (مقتطف ${TEXT_PREVIEW_MAX} حرفاً). عدّل ثم احفظ بـ edit_document.`
      : `قُرئ «${hit.meta.originalName}». عدّل المحتوى ثم احفظ بـ edit_document.`,
  }
}

/** Re-attach an existing workspace file so it appears as a download chip in chat. */
export async function executeReturnFile(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.path || params.name || '').trim()
  if (!ref) throw new Error('مرّر fileId أو اسم الملف.')

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) {
    throw new Error(`لم يُعثر على الملف «${ref}». استخدم list_workspace_files.`)
  }

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(found.id)}&scopeId=${encodeURIComponent(scopeId)}`
  return {
    ok: true,
    fileId: found.id,
    name: found.originalName,
    mimeType: found.mimeType,
    downloadPath,
    downloadUrl: downloadPath,
    attachments: [
      {
        fileId: found.id,
        name: found.originalName,
        mimeType: found.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr: `الملف «${found.originalName}» جاهز للتنزيل في الشات.`,
  }
}

export async function executeEditDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const replaceSource = Boolean(params.replaceSource)
  const sourceRef = String(params.fileId || params.sourceFileId || '').trim()

  let format = String(params.format || '').toLowerCase() as DocFormat | ''
  let outputName = String(params.outputName || params.filename || '').trim()
  let versionTag: string | null = null

  const sourceFound = sourceRef
    ? await findWorkspaceFile(scopeId, sourceRef)
    : null

  if (sourceFound) {
    if (!format) {
      format = (inferFormatFromName(sourceFound.originalName) ||
        'docx') as DocFormat
    }
    if (replaceSource) {
      if (!outputName) outputName = sourceFound.originalName
    } else if (!outputName) {
      const existing = await listWorkspaceFiles(scopeId)
      const next = nextVersionFileName(
        sourceFound.originalName,
        existing.map((f) => f.originalName)
      )
      outputName = next.fileName
      versionTag = next.versionTag
    } else {
      const m = outputName.match(/-v(\d+\.\d+)(?:\.|$)/i)
      versionTag = m ? `v${m[1]}` : null
    }
  }

  if (!format) format = 'docx'
  const allowed: DocFormat[] = ['docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'pdf']
  if (!allowed.includes(format)) {
    throw new Error(`صيغة غير مدعومة: ${format}. استخدم: ${allowed.join(', ')}`)
  }

  if (!versionTag && outputName) {
    const m = outputName.match(/-v(\d+\.\d+)(?:\.|$)/i)
    versionTag = m ? `v${m[1]}` : null
  }

  const body = params.body != null ? String(params.body) : undefined
  const paragraphs = asStringArray(params.paragraphs)
  const sheets = asSheets(params.sheets)
  const slides = asSlides(params.slides)
  const replacements = asReplacements(
    params.replacements || params.findReplace || params.patches
  )
  const templateData = asTemplateData(
    params.templateData || params.data || params.placeholders
  )
  const title =
    params.title != null ? String(params.title) : undefined

  const hasRebuildContent = Boolean(
    body || paragraphs?.length || sheets?.length || slides?.length
  )
  const hasInPlace =
    Boolean(replacements?.length || templateData) && Boolean(sourceFound)

  if (!hasRebuildContent && !hasInPlace) {
    throw new Error(
      'مرّر المحتوى المعدّل: body/paragraphs (Word/نص)، sheets (Excel)، slides (PowerPoint)، أو replacements/templateData مع fileId لتعديل OOXML مع الحفاظ على التنسيق.'
    )
  }

  const filename = ensureFilename(
    outputName || title || sourceFound?.originalName || `ملف-معدّل.${format}`,
    format
  )

  let outBuffer: Buffer
  let outMime: string
  let editMode: 'rebuild' | 'replace' | 'template' = 'rebuild'
  let patchMeta: Record<string, unknown> | undefined

  if (hasInPlace && sourceFound && (format === 'docx' || format === 'pptx')) {
    const hit = await readWorkspaceFile(scopeId, sourceFound.id)
    if (templateData) {
      outBuffer = await fillOfficeTemplate({
        buffer: hit.buffer,
        format,
        data: templateData,
      })
      outMime = mimeForFormat(format)
      editMode = 'template'
      patchMeta = { keys: Object.keys(templateData) }
    } else if (replacements?.length) {
      const patched = await patchOfficeOpenXml({
        buffer: hit.buffer,
        format,
        replacements,
      })
      outBuffer = patched.buffer
      outMime = mimeForFormat(format)
      editMode = 'replace'
      patchMeta = {
        totalReplacements: patched.totalReplacements,
        partsTouched: patched.partsTouched,
      }
    } else {
      throw new Error('تعذّر التعديل الموضعي.')
    }
  } else {
    if (!hasRebuildContent) {
      throw new Error(
        'التعديل الموضعي (replacements/templateData) يعمل على docx/pptx مع fileId. لـ PDF استخدم pdf_* أو body؛ لـ Excel استخدم edit_excel.'
      )
    }
    const built = await buildDocumentBuffer({
      format,
      title,
      body,
      paragraphs,
      sheets,
      slides,
    })
    outBuffer = built.buffer
    outMime = built.mimeType
    editMode = 'rebuild'
  }

  const replaceId =
    replaceSource && sourceFound ? sourceFound.id : undefined

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: outBuffer,
    originalName: filename,
    mimeType: outMime,
    replaceId,
  })

  if (!replaceId && versionTag) {
    try {
      const sb = getSupabaseAdmin()
      if (sb) {
        await sb.from('workspace_file_versions').insert({
          id: randomUUID(),
          scope_id: scopeId,
          source_file_id: sourceFound?.id || null,
          version_tag: versionTag,
          file_id: saved.file.id,
          original_name: saved.file.originalName,
          created_by: params.userId ? String(params.userId) : null,
        })
      }
    } catch {
      /* table may not exist yet */
    }
  }

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  const modeAr =
    editMode === 'replace'
      ? 'استبدال نصّي مع الحفاظ على التنسيق (OOXML)'
      : editMode === 'template'
        ? 'تعبئة قالب {placeholders} عبر docxtemplater'
        : 'إعادة بناء من المحتوى'

  return {
    ok: true,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    size: saved.file.size,
    format,
    source: saved.source,
    replaced: Boolean(replaceId),
    versionTag,
    editMode,
    patchMeta,
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
    messageAr: replaceId
      ? `تم استبدال الملف «${saved.file.originalName}» (${modeAr}). يمكن تنزيله من قسم الملفات أو من رابط التحميل في الرد.`
      : versionTag
        ? `حُفظت نسخة ${versionTag}: «${saved.file.originalName}» (${modeAr}). الأصل لم يُمس.`
        : `تم حفظ النسخة المعدّلة «${saved.file.originalName}» (${modeAr}). أخبر المستخدم أنه يستطيع تنزيلها الآن.`,
  }
}

/** Legacy stub names → real workspace vault. */
export async function executeListFiles(
  name: string,
  params: Record<string, unknown>
) {
  return executeListWorkspaceFiles(name, params)
}

export async function executeReadFile(
  name: string,
  params: Record<string, unknown>
) {
  const ref = String(params.path || params.fileId || params.name || '').trim()
  if (!ref) {
    return executeListWorkspaceFiles(name, params)
  }
  return executeReadDocument(name, { ...params, fileId: ref })
}
