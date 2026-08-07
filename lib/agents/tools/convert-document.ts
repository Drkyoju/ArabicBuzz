/**
 * Convert between Office/PDF formats.
 * 1) Optional CloudConvert (paid, high fidelity) when CLOUDCONVERT_API_KEY is set
 * 2) Free Arabic-aware text rebuild (layout/images not preserved)
 */
import { extractDocumentText } from '@/lib/rag/extract'
import {
  buildDocumentBuffer,
  ensureFilename,
  inferFormatFromName,
  type DocFormat,
} from '@/lib/documents/build'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'
import {
  cloudConvertConfigured,
  convertViaCloudConvert,
} from '@/lib/documents/cloudconvert'

const FREE_ALLOWED: DocFormat[] = ['docx', 'pdf', 'txt', 'md']
const CLOUD_ALLOWED = [
  'docx',
  'doc',
  'pdf',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'txt',
  'md',
  'rtf',
] as const

export async function executeConvertDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.path || params.name || '').trim()
  if (!ref) {
    throw new Error('مرّر fileId للملف المراد تحويله.')
  }

  const toRaw = String(params.toFormat || params.format || '')
    .toLowerCase()
    .trim()
  const toFormat = (toRaw === 'word' ? 'docx' : toRaw) as DocFormat
  const preferCloud =
    params.engine === 'cloudconvert' ||
    params.preferCloud === true ||
    (cloudConvertConfigured() &&
      params.engine !== 'free' &&
      params.preferCloud !== false)

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) {
    throw new Error(
      `لم يُعثر على «${ref}». افتحه من Drive بـ brain_open_document أو من list_workspace_files.`
    )
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  const fromFormat =
    (inferFormatFromName(hit.meta.originalName) as DocFormat | null) || 'txt'

  if (fromFormat === toFormat) {
    throw new Error(`الملف بالفعل بصيغة ${toFormat}.`)
  }

  const baseName = hit.meta.originalName.replace(/\.[^.]+$/, '')
  let outputName = String(params.outputName || '').trim()
  if (!outputName) {
    const existing = await listWorkspaceFiles(scopeId)
    const next = nextVersionFileName(
      `${baseName}.${toFormat}`,
      existing.map((f) => f.originalName)
    )
    outputName = next.fileName
  }

  // ── Paid high-fidelity path ──
  if (
    preferCloud &&
    cloudConvertConfigured() &&
    (CLOUD_ALLOWED as readonly string[]).includes(toFormat)
  ) {
    try {
      const filename = ensureFilename(outputName, toFormat as DocFormat)
      const converted = await convertViaCloudConvert({
        buffer: hit.buffer,
        filename: hit.meta.originalName,
        inputFormat: fromFormat,
        outputFormat: toFormat,
      })
      const saved = await saveWorkspaceFile({
        scopeId,
        buffer: converted.buffer,
        originalName: converted.filename || filename,
        mimeType: converted.mimeType,
      })
      const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`
      return {
        ok: true,
        fileId: saved.file.id,
        name: saved.file.originalName,
        mimeType: saved.file.mimeType,
        fromFormat,
        toFormat,
        engine: 'cloudconvert',
        sourceFileId: hit.meta.id,
        sourceName: hit.meta.originalName,
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
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر CloudConvert (اختياري مدفوع — دقة أعلى للتخطيط). الملف جاهز للتنزيل.`,
        noteAr: 'محرّك: CloudConvert. بدون المفتاح يُستخدم المسار المجاني (إعادة بناء نصية).',
      }
    } catch (e) {
      // Fall through to free rebuild unless caller forced cloud
      if (params.engine === 'cloudconvert') {
        throw e instanceof Error ? e : new Error(String(e))
      }
      // continue to free path
    }
  }

  if (!FREE_ALLOWED.includes(toFormat)) {
    if (!cloudConvertConfigured()) {
      throw new Error(
        `التحويل المجاني: pdf ↔ docx (و txt/md). للـ xlsx/pptx/doc قديم أضف CLOUDCONVERT_API_KEY (اختياري مدفوع). طُلب: ${toRaw || '—'}`
      )
    }
    throw new Error(
      `صيغة غير مدعومة: ${toRaw || '—'}. المدعوم مع CloudConvert: ${CLOUD_ALLOWED.join(', ')}`
    )
  }

  const extracted = await extractDocumentText({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    enableOcr: true,
  })
  const text = (extracted.text || '').trim()
  if (!text) {
    throw new Error(
      'تعذّر استخراج نص عربي/لاتيني صالح للتحويل. جرّب arabic_ocr أولاً للملفات الممسوحة.'
    )
  }

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const filename = ensureFilename(outputName, toFormat)
  const built = await buildDocumentBuffer({
    format: toFormat,
    title: params.title != null ? String(params.title) : baseName,
    paragraphs,
    body: paragraphs.join('\n\n'),
  })

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: built.buffer,
    originalName: filename,
    mimeType: built.mimeType,
  })

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    fromFormat,
    toFormat,
    engine: 'free-rebuild',
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    charCount: text.length,
    paragraphCount: paragraphs.length,
    extractMethod: extracted.method,
    ocrUsed: extracted.ocrUsed,
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
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} مع الحفاظ على النص العربي (إعادة بناء نصية — بدون صور/تخطيط أصلي). الملف جاهز للتنزيل في الشات.`,
    noteAr:
      'التحويل نصّي مجاني. للجودة أعلى (صور/تخطيط) اضبط CLOUDCONVERT_API_KEY — اختياري مدفوع.',
  }
}
