/**
 * Convert between Office/PDF formats.
 * Chain (engine=auto):
 *  1) Google Drive import/export — best free quality when Google is linked
 *  2) CloudConvert — optional paid when CLOUDCONVERT_API_KEY is set
 *  3) Free Arabic text rebuild (pdf/docx/txt/md only)
 */
import { extractDocumentText } from '@/lib/rag/extract'
import { readDocumentPages } from '@/lib/documents/read-pages'
import {
  assessArabicTextQuality,
  brokenToUnicodeErrorAr,
} from '@/lib/documents/arabic-text-quality'
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
import {
  macConvertPdfDocx,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

/** Free local rebuild pairs (no Drive/CloudConvert). Layout not preserved. */
const FREE_ALLOWED: DocFormat[] = ['docx', 'pdf', 'txt', 'md', 'xlsx', 'pptx', 'csv']
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
        edited: true,
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

  let googleFailAr: string | null = null
  let cloudFailAr: string | null = null
  let macFailAr: string | null = null

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
          markEdited: true,
        })
        return attachmentResult({
          saved,
          scopeId,
          fromFormat,
          toFormat,
          engine: 'google-drive',
          sourceFileId: hit.meta.id,
          sourceName: hit.meta.originalName,
          messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر Google Drive (مجاني · جودة عالية). نزّل أو عاين الملف من فقاعة الشات — تم التعديل.`,
          noteAr:
            'محرّك: Google Drive (استيراد/تصدير مؤقت ثم حذف). الأفضل للعربية والتخطيط. النتيجة مرفق شات (معاينة+تنزيل) وليست فقط ملفات الفريق.',
        })
      } catch (e) {
        googleFailAr =
          e instanceof Error ? e.message : 'فشل تحويل Google Drive'
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
        markEdited: true,
      })
      return attachmentResult({
        saved,
        scopeId,
        fromFormat,
        toFormat,
        engine: 'cloudconvert',
        sourceFileId: hit.meta.id,
        sourceName: hit.meta.originalName,
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر CloudConvert (اختياري مدفوع). نزّل أو عاين من فقاعة الشات — تم التعديل.`,
        noteAr:
          'محرّك: CloudConvert. الأفضل مجاناً: اربط Google. النتيجة مرفق شات (معاينة+تنزيل).',
      })
    } catch (e) {
      cloudFailAr =
        e instanceof Error ? e.message : 'فشل تحويل CloudConvert'
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

  // ── 3) Free text / structured rebuild ──
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
      `تعذّر التحويل إلى ${toRaw || '—'}. المسار النصّي المجاني: pdf/docx/pptx/xlsx ↔ بعضها (نص فقط). ${tips.join(' · ')}`
    )
  }

  // Prefer page-aware extract so we don't drop sheets/slides
  const paged = await readDocumentPages({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    pageStart: 1,
    maxChars: 200_000,
    enableOcr: true,
  })
  let text = (paged.text || '').trim()
  let extractMethod = paged.extractMethod
  let ocrUsed = paged.ocrUsed

  if (!text || text.length < 40) {
    const extracted = await extractDocumentText({
      buffer: hit.buffer,
      filename: hit.meta.originalName,
      mimeType: hit.meta.mimeType,
      enableOcr: true,
    })
    text = (extracted.text || '').trim()
    extractMethod = extracted.method
    ocrUsed = extracted.ocrUsed
  }

  if (!text) {
    throw new Error(
      'تعذّر استخراج نص عربي/لاتيني صالح للتحويل. جرّب arabic_ocr أولاً للملفات الممسوحة، أو اربط Google لتحويل Drive.'
    )
  }

  const quality = assessArabicTextQuality(text)
  const arabicBroken =
    fromFormat === 'pdf' &&
    (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx') &&
    quality.broken

  // Broken ToUnicode: prefer Mac visual page-image DOCX (layout 100%) over gibberish text rebuild
  if (
    arabicBroken &&
    engine === 'auto' &&
    fromFormat === 'pdf' &&
    toFormat === 'docx' &&
    macSyncConfigured()
  ) {
    try {
      const converted = await macConvertPdfDocx({
        buffer: hit.buffer,
        filename: hit.meta.originalName,
        toFormat: 'docx',
        mode: 'visual',
      })
      const filename = ensureFilename(
        outputName.replace(/\.docx$/i, '') + '_مرئي.docx',
        'docx'
      )
      const saved = await saveWorkspaceFile({
        scopeId,
        buffer: converted.buffer,
        originalName: filename,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        markEdited: true,
      })
      return attachmentResult({
        saved,
        scopeId,
        fromFormat,
        toFormat,
        engine: 'mac-visual',
        sourceFileId: hit.meta.id,
        sourceName: hit.meta.originalName,
        messageAr: `حُوّل «${hit.meta.originalName}» إلى Word مرئي (صورة لكل صفحة · تخطيط مطابق 100%) عبر جسر الماك — بلا طلاسم. نزّل أو عاين من فقاعة الشات — تم التعديل.`,
        noteAr:
          'محرّك: مرئي عبر جسر الماك. الطبقة النصية في PDF معطوبة (ToUnicode) — للتحرير النصي اربط Google Drive (OCR/تصدير). النتيجة مرفق شات (معاينة+تنزيل).',
        extra: {
          visualLayoutMatch: true,
          textEditable: false,
          qualityPercent: { layout: 100, editableText: 0 },
          macLog: converted.log.slice(0, 400),
        },
      })
    } catch (e) {
      macFailAr = e instanceof Error ? e.message : 'فشل التحويل المرئي عبر الماك'
      // fall through to honest error / free rebuild if forced
    }
  }

  const forceBroken =
    params.forceBrokenRebuild === true ||
    params.acceptBrokenText === true ||
    String(params.forceBrokenRebuild || '').toLowerCase() === 'true'

  // Never emit silent طلاسم — refuse broken ToUnicode unless explicitly forced.
  if (arabicBroken && !forceBroken) {
    const tried: string[] = []
    if (googleFailAr) tried.push(`Google: ${googleFailAr}`)
    if (cloudFailAr) tried.push(`CloudConvert: ${cloudFailAr}`)
    if (macFailAr) tried.push(`مرئي/ماك: ${macFailAr}`)
    if (!googleLinked) tried.push('Google غير مربوط')
    if (!cloudConvertConfigured()) tried.push('CloudConvert غير مضبوط')
    if (!macSyncConfigured()) tried.push('جسر الماك غير مضبوط')
    throw new Error(
      [
        brokenToUnicodeErrorAr({
          hasMac: macSyncConfigured(),
          hasGoogleHint: !googleLinked,
        }),
        tried.length ? `محاولات: ${tried.join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    )
  }

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  // Structured targets from page units
  let sheets:
    | Array<{ name?: string; rows: Array<Array<string>> }>
    | undefined
  let slides: Array<{ title: string; bullets?: string[] }> | undefined

  if (toFormat === 'xlsx') {
    sheets = paged.pages.map((p) => {
      const lines = p.text.split('\n').filter((l) => l.trim())
      const rows = lines.map((line) =>
        line.includes('\t') ? line.split('\t') : [line]
      )
      return {
        name: (p.labelAr || `Sheet${p.index}`).slice(0, 31),
        rows: rows.length ? rows : [['']],
      }
    })
    if (!sheets.length) {
      sheets = [
        {
          name: 'مستخرج',
          rows: paragraphs.map((p) => [p]),
        },
      ]
    }
  }

  if (toFormat === 'pptx') {
    slides = paged.pages.slice(0, 40).map((p) => {
      const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean)
      return {
        title: lines[0]?.slice(0, 120) || p.labelAr || `شريحة ${p.index}`,
        bullets: lines.slice(1, 12),
      }
    })
    if (!slides.length) {
      slides = paragraphs.slice(0, 20).map((p, i) => ({
        title: `شريحة ${i + 1}`,
        bullets: [p.slice(0, 200)],
      }))
    }
  }

  const filename = ensureFilename(outputName, toFormat)
  const built = await buildDocumentBuffer({
    format: toFormat,
    title: params.title != null ? String(params.title) : baseName,
    paragraphs:
      toFormat === 'docx' || toFormat === 'pdf' || toFormat === 'txt' || toFormat === 'md'
        ? paragraphs
        : undefined,
    body: paragraphs.join('\n\n'),
    sheets,
    slides,
  })

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: built.buffer,
    originalName: filename,
    mimeType: built.mimeType,
    markEdited: true,
  })

  return attachmentResult({
    saved,
    scopeId,
    fromFormat,
    toFormat,
    engine: 'free-rebuild',
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} بإعادة بناء نصية عربية (بدون صور/تخطيط أصلي). نزّل أو عاين من فقاعة الشات — تم التعديل.`,
    noteAr: forceBroken && quality.broken
      ? 'تحذير: فُرضت إعادة بناء نصية رغم ToUnicode معطوب — راجع النص يدوياً (قد تظهر طلاسم). الأفضل لاحقاً: Google Drive أو CloudConvert أو Word مرئي عبر الماك.'
      : googleLinked
        ? 'محرّك: إعادة بناء نصية (احتياطي). لـ PDF عربي بطبقة نص معطوبة (ToUnicode) فضّل Google Drive أو CloudConvert — المسار النصّي قد يُظهر طلاسم.'
        : 'الأفضل للعربية: اربط Google (Drive) أو CloudConvert. إعادة البناء النصية احتياطي وقد تفشل مع PDF بطبقة نص معطوبة.',
    extra: {
      charCount: text.length,
      paragraphCount: paragraphs.length,
      extractMethod,
      ocrUsed,
      qualityPercent: {
        layout: 0,
        editableText: quality.broken ? 15 : 70,
      },
      warningAr: quality.broken
        ? 'تحذير: إشارات ToUnicode معطوبة — راجع النص يدوياً.'
        : undefined,
      priorEngineFailures: {
        google: googleFailAr,
        cloudconvert: cloudFailAr,
        macVisual: macFailAr,
      },
    },
  })
}

/** Alias used by agents / prompts as convert_file. */
export const executeConvertFile = executeConvertDocument
