/**
 * Convert between Office/PDF formats.
 * Chain (engine=auto):
 *  1) Google Drive import/export — best free quality when Google is linked
 *  2) CloudConvert — optional paid when CLOUDCONVERT_API_KEY is set
 *  3) Free Arabic text rebuild (pdf/docx/txt/md only)
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
import {
  canConvertViaGoogleDrive,
  convertViaGoogleDrive,
  googleDriveConvertAvailable,
} from '@/lib/documents/google-drive-convert'

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

function resolveUserId(params: Record<string, unknown>): string {
  return String(params.userId || params._userId || '').trim()
}

function attachmentResult(opts: {
  saved: { file: { id: string; originalName: string; mimeType: string } }
  scopeId: string
  fromFormat: string
  toFormat: string
  engine: string
  sourceFileId: string
  sourceName: string
  messageAr: string
  noteAr: string
  extra?: Record<string, unknown>
}) {
  const downloadPath = `/api/storage/file?id=${encodeURIComponent(opts.saved.file.id)}&scopeId=${encodeURIComponent(opts.scopeId)}`
  return {
    ok: true,
    fileId: opts.saved.file.id,
    name: opts.saved.file.originalName,
    mimeType: opts.saved.file.mimeType,
    fromFormat: opts.fromFormat,
    toFormat: opts.toFormat,
    engine: opts.engine,
    sourceFileId: opts.sourceFileId,
    sourceName: opts.sourceName,
    downloadPath,
    attachments: [
      {
        fileId: opts.saved.file.id,
        name: opts.saved.file.originalName,
        mimeType: opts.saved.file.mimeType,
        scopeId: opts.scopeId,
        downloadPath,
      },
    ],
    messageAr: opts.messageAr,
    noteAr: opts.noteAr,
    ...(opts.extra || {}),
  }
}

export async function executeConvertDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const userId = resolveUserId(params)
  const ref = String(params.fileId || params.path || params.name || '').trim()
  if (!ref) {
    throw new Error('مرّر fileId للملف المراد تحويله.')
  }

  const toRaw = String(params.toFormat || params.format || '')
    .toLowerCase()
    .trim()
  const toFormat = (toRaw === 'word' ? 'docx' : toRaw) as DocFormat
  const engineRaw = String(params.engine || 'auto')
    .toLowerCase()
    .trim()
  const engine =
    engineRaw === 'google' || engineRaw === 'google-drive'
      ? 'google'
      : engineRaw === 'cloudconvert'
        ? 'cloudconvert'
        : engineRaw === 'free'
          ? 'free'
          : 'auto'

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

  const googleLinked =
    engine !== 'free' &&
    engine !== 'cloudconvert' &&
    (await googleDriveConvertAvailable(userId))
  const googleOk =
    googleLinked && canConvertViaGoogleDrive(fromFormat, toFormat)
  const wantGoogle =
    engine === 'google' || (engine === 'auto' && googleOk)

  // ── 1) Best free: Google Drive import/export ──
  if (wantGoogle) {
    if (!googleLinked) {
      throw new Error(
        'تحويل Google يحتاج ربط الحساب من الإعدادات → «ربط Google (Drive)». لا يلزم دفع.'
      )
    }
    if (!canConvertViaGoogleDrive(fromFormat, toFormat)) {
      if (engine === 'google') {
        throw new Error(
          `تحويل Google لا يدعم ${fromFormat} → ${toFormat}. جرّب CloudConvert (اختياري مدفوع) أو صيغة ضمن نفس العائلة (مثل pdf↔docx أو xlsx↔pdf).`
        )
      }
    } else {
      try {
        const filename = ensureFilename(outputName, toFormat as DocFormat)
        const converted = await convertViaGoogleDrive({
          userId,
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
        return attachmentResult({
          saved,
          scopeId,
          fromFormat,
          toFormat,
          engine: 'google-drive',
          sourceFileId: hit.meta.id,
          sourceName: hit.meta.originalName,
          messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر Google Drive (مجاني · جودة عالية). الملف جاهز للتنزيل.`,
          noteAr:
            'محرّك: Google Drive (استيراد/تصدير مؤقت ثم حذف). الأفضل مجاناً عند ربط Google.',
        })
      } catch (e) {
        if (engine === 'google') {
          throw e instanceof Error ? e : new Error(String(e))
        }
        // fall through to CloudConvert / free
      }
    }
  }

  // ── 2) Optional paid: CloudConvert ──
  const wantCloud =
    engine === 'cloudconvert' ||
    (engine === 'auto' &&
      cloudConvertConfigured() &&
      params.preferCloud !== false)

  if (
    wantCloud &&
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
      return attachmentResult({
        saved,
        scopeId,
        fromFormat,
        toFormat,
        engine: 'cloudconvert',
        sourceFileId: hit.meta.id,
        sourceName: hit.meta.originalName,
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر CloudConvert (اختياري مدفوع). الملف جاهز للتنزيل.`,
        noteAr:
          'محرّك: CloudConvert. الأفضل مجاناً: اربط Google لاستخدام تحويل Drive.',
      })
    } catch (e) {
      if (engine === 'cloudconvert') {
        throw e instanceof Error ? e : new Error(String(e))
      }
      // fall through to free rebuild
    }
  }

  if (engine === 'cloudconvert' && !cloudConvertConfigured()) {
    throw new Error(
      'CloudConvert غير مضبوط. الأفضل مجاناً: اربط Google من الإعدادات، أو أضف CLOUDCONVERT_API_KEY (اختياري مدفوع).'
    )
  }

  // ── 3) Free text rebuild ──
  if (!FREE_ALLOWED.includes(toFormat)) {
    const tips: string[] = []
    if (!googleLinked) {
      tips.push('اربط Google من الإعدادات (مجاني · الأفضل لجودة التحويل)')
    } else if (!canConvertViaGoogleDrive(fromFormat, toFormat)) {
      tips.push(
        `زوج ${fromFormat}→${toFormat} خارج عائلات Google (Docs/Sheets/Slides)`
      )
    }
    if (!cloudConvertConfigured()) {
      tips.push('أو أضف CLOUDCONVERT_API_KEY (اختياري مدفوع) لـ xlsx/pptx/doc')
    }
    throw new Error(
      `تعذّر التحويل إلى ${toRaw || '—'}. المسار النصّي المجاني: pdf ↔ docx (و txt/md). ${tips.join(' · ')}`
    )
  }

  if (engine === 'google' || engine === 'cloudconvert') {
    // Forced engines already threw above; reach here only if free formats remain
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
      'تعذّر استخراج نص عربي/لاتيني صالح للتحويل. جرّب arabic_ocr أولاً للملفات الممسوحة، أو اربط Google لتحويل Drive.'
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

  return attachmentResult({
    saved,
    scopeId,
    fromFormat,
    toFormat,
    engine: 'free-rebuild',
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} بإعادة بناء نصية عربية (بدون صور/تخطيط أصلي). الملف جاهز للتنزيل.`,
    noteAr: googleLinked
      ? 'محرّك: إعادة بناء نصية. إن فشل Google/CloudConvert يُستخدم هذا المسار.'
      : 'الأفضل مجاناً: اربط Google من الإعدادات لتحويل عالي الجودة (تخطيط أفضل). CloudConvert اختياري مدفوع.',
    extra: {
      charCount: text.length,
      paragraphCount: paragraphs.length,
      extractMethod: extracted.method,
      ocrUsed: extracted.ocrUsed,
    },
  })
}

/** Alias used by agents / prompts as convert_file. */
export const executeConvertFile = executeConvertDocument
