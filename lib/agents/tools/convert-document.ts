/**
 * Convert between Office/PDF formats — clean Arabic or refuse (never ship طلاسم).
 *
 * Chain (engine=auto):
 *  1) Google Drive — ONLY if Arabic quality gate passes; else discard entirely
 *  2) LibreOffice soffice — Word↔PDF when available (NOT PDF→Office Arabic)
 *  3) CloudConvert — optional paid (CLOUDCONVERT_API_KEY); never required
 *  4) Clean free rebuild from best of: pdf-parse-safe / page extract / OCR
 *
 * Hard-disabled: Drive mojibake export, pdf2docx for Arabic, pdf-lib Arabic body,
 * forceBrokenRebuild shipping طلاسم.
 */
import { extractDocumentText } from '@/lib/rag/extract'
import { runArabicOcr } from '@/lib/rag/ocr'
import { readDocumentPages } from '@/lib/documents/read-pages'
import {
  brokenToUnicodeErrorAr,
  hasArabicMojibake,
  pickBestCleanArabicText,
  preferLocalArabicOverDrive,
  sheetsToDocxBlocks,
  structureArabicParagraphs,
  textPagesToSheetRows,
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
  canConvertViaLibreOffice,
  convertViaLibreOffice,
  libreOfficeAvailable,
} from '@/lib/documents/libreoffice-convert'
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
      : engineRaw === 'libreoffice' || engineRaw === 'soffice'
        ? 'libreoffice'
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
  let loFailAr: string | null = null

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
          `تحويل Google لا يدعم ${fromFormat} → ${toFormat}. اربط Google واستخدم صيغة ضمن نفس العائلة (مثل pdf↔docx أو xlsx↔pdf أو pptx↔pdf). المسار النصّي المحلي احتياطي عند غياب Drive.`
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

        // PDF→Office: quality-gate Drive export. Drive often re-encodes broken
        // ToUnicode as editable طلاسم (الالئحة/األساسية) while local pdf-parse is clearer.
        const officeFromPdf =
          fromFormat === 'pdf' &&
          (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx')
        if (officeFromPdf) {
          const [driveExtracted, localExtracted] = await Promise.all([
            extractDocumentText({
              buffer: Buffer.from(converted.buffer),
              filename: converted.filename || filename,
              mimeType: converted.mimeType,
              enableOcr: false,
            }),
            extractDocumentText({
              buffer: hit.buffer,
              filename: hit.meta.originalName,
              mimeType: hit.meta.mimeType,
              enableOcr: false,
            }),
          ])
          const gate = preferLocalArabicOverDrive({
            driveText: driveExtracted.text || '',
            localText: localExtracted.text || '',
          })
          if (gate.preferLocal || gate.discardDrive) {
            // Hard-disable: never save Drive طلاسم — fall through to clean rebuild / refuse.
            googleFailAr =
              gate.reasonAr ||
              'تصدير Drive عربي معطوب — رُفض بالكامل'
          } else {
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
              extra: {
                arabicQualityGate: {
                  passed: true,
                  driveBroken: gate.driveQ.broken,
                  localBroken: gate.localQ.broken,
                },
              },
            })
          }
        } else {
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
        }
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

  // ── 2) LibreOffice (free/OSS when soffice is installed on the image/host) ──
  // Prefer for Word↔PDF layout fidelity before any paid API.
  // Skip PDF→Office here (LO often preserves broken ToUnicode); Drive/visual first.
  const loOk =
    engine === 'auto' ||
    engine === 'free' ||
    engine === 'libreoffice'
      ? await libreOfficeAvailable()
      : false
  if (engine === 'libreoffice' && !loOk) {
    throw new Error(
      'LibreOffice (soffice) غير متوفر في هذه البيئة. اربط Google للتحويل المجاني، أو أعد بناء الصورة بـ INSTALL_LIBREOFFICE=1.'
    )
  }
  if (
    loOk &&
    canConvertViaLibreOffice(fromFormat, toFormat) &&
    !(fromFormat === 'pdf' && (toFormat === 'docx' || toFormat === 'xlsx'))
  ) {
    try {
      const converted = await convertViaLibreOffice({
        buffer: hit.buffer,
        filename: hit.meta.originalName,
        inputFormat: fromFormat,
        outputFormat: toFormat,
      })
      const filename = ensureFilename(
        converted.filename || outputName,
        toFormat as DocFormat
      )
      const saved = await saveWorkspaceFile({
        scopeId,
        buffer: converted.buffer,
        originalName: filename,
        mimeType: converted.mimeType,
        markEdited: true,
      })
      return attachmentResult({
        saved,
        scopeId,
        fromFormat,
        toFormat,
        engine: 'libreoffice',
        sourceFileId: hit.meta.id,
        sourceName: hit.meta.originalName,
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر LibreOffice (مجاني · soffice). نزّل أو عاين من فقاعة الشات — تم التعديل.`,
        noteAr:
          'محرّك: LibreOffice محلي (مجاني/مفتوح المصدر). الأفضل مع Drive للعربية. النتيجة مرفق شات (معاينة+تنزيل).',
      })
    } catch (e) {
      loFailAr = e instanceof Error ? e.message : 'فشل LibreOffice'
      if (engine === 'libreoffice') {
        throw e instanceof Error ? e : new Error(String(e))
      }
      // fall through
    }
  }

  // ── 3) Optional paid: CloudConvert (only if key set — never required) ──
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
          'محرّك: CloudConvert (مدفوع). الأفضل مجاناً: Google Drive أو LibreOffice. النتيجة مرفق شات (معاينة+تنزيل).',
      })
    } catch (e) {
      cloudFailAr =
        e instanceof Error ? e.message : 'فشل تحويل CloudConvert'
      if (engine === 'cloudconvert') {
        throw e instanceof Error ? e : new Error(String(e))
      }
      // fall through
    }
  }

  if (engine === 'cloudconvert' && !cloudConvertConfigured()) {
    throw new Error(
      'CloudConvert غير مضبوط. الأفضل مجاناً: اربط Google أو استخدم LibreOffice على CranL، أو أضف CLOUDCONVERT_API_KEY (اختياري مدفوع).'
    )
  }

  // ── 4) Clean free rebuild (pdf-parse-safe / OCR) — never ship طلاسم ──
  if (!FREE_ALLOWED.includes(toFormat)) {
    const tips: string[] = []
    if (googleFailAr) tips.push(googleFailAr)
    if (!loOk) tips.push('LibreOffice غير متوفر')
    throw new Error(
      `تعذّر التحويل إلى ${toRaw || '—'}. المسار النظيف المجاني: pdf/docx/pptx/xlsx عبر إعادة بناء من نص عربي سليم فقط. ${tips.join(' · ')}`
    )
  }

  const officeFromPdf =
    fromFormat === 'pdf' &&
    (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx')

  // Hard-disable: pdf-lib Arabic Word→PDF (disconnected glyphs). Refuse always.
  if (toFormat === 'pdf' && fromFormat !== 'pdf') {
    const probe = await extractDocumentText({
      buffer: hit.buffer,
      filename: hit.meta.originalName,
      mimeType: hit.meta.mimeType,
      enableOcr: false,
    })
    const arHeavy =
      ((probe.text || '').match(/[\u0600-\u06FF]/g) || []).length >= 40
    if (arHeavy) {
      const tried: string[] = []
      if (googleFailAr) tried.push(`Google: ${googleFailAr}`)
      if (cloudFailAr) tried.push(`CloudConvert: ${cloudFailAr}`)
      if (loFailAr) tried.push(`LibreOffice: ${loFailAr}`)
      throw new Error(
        [
          'مسار Word→PDF النصّي المحلي (pdf-lib) معطّل للعربية — يُنتج حروفاً منفصلة/رديئة.',
          'المسارات المسموحة: Google Drive إن اجتاز بوابة الجودة، أو LibreOffice، أو CloudConvert (مدفوع اختياري).',
          tried.length ? `محاولات: ${tried.join(' · ')}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      )
    }
  }

  // Collect extract candidates — prefer pdf-parse-safe over pdfjs when cleaner
  const paged = await readDocumentPages({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    pageStart: 1,
    maxChars: 200_000,
    enableOcr: false,
  })
  const pdfParseExtract = await extractDocumentText({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    enableOcr: false,
  })

  let best = pickBestCleanArabicText([
    { text: pdfParseExtract.text || '', source: 'pdf-parse-safe' },
    { text: paged.text || '', source: 'read-pages' },
  ])

  let ocrUsed = false
  let extractMethod = best?.source || pdfParseExtract.method || paged.extractMethod
  let ocrFailAr: string | null = null

  // If no clean text yet and PDF→Office: try OCR cascade (Gemini/Qari/Mac) — still no gibberish
  if (!best && officeFromPdf) {
    try {
      const ocr = await runArabicOcr({
        buffer: hit.buffer,
        filename: hit.meta.originalName,
        mimeType: hit.meta.mimeType,
      })
      if (ocr.text?.trim()) {
        const ocrBest = pickBestCleanArabicText([
          { text: ocr.text, source: `ocr-${ocr.provider}` },
        ])
        if (ocrBest) {
          best = ocrBest
          ocrUsed = true
          extractMethod = ocrBest.source
        } else {
          ocrFailAr = `OCR (${ocr.provider}) أنتج نصاً غير نظيف أو فارغاً`
        }
      } else {
        ocrFailAr = ocr.error || 'OCR لم يُرجع نصاً'
      }
    } catch (e) {
      ocrFailAr = e instanceof Error ? e.message : 'فشل OCR'
    }
  }

  // Still broken: Mac visual DOCX (images — no editable طلاسم text)
  if (
    !best &&
    officeFromPdf &&
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
        messageAr: `حُوّل «${hit.meta.originalName}» إلى Word مرئي (صورة لكل صفحة) — بلا طلاسم نصية. نزّل أو عاين من فقاعة الشات — تم التعديل.`,
        noteAr:
          'محرّك مرئي عبر جسر الماك. النص غير قابل للتحرير. للتحرير النصي يلزم استخراج/OCR نظيف.',
        extra: {
          visualLayoutMatch: true,
          textEditable: false,
          qualityPercent: { layout: 100, editableText: 0 },
        },
      })
    } catch (e) {
      macFailAr = e instanceof Error ? e.message : 'فشل التحويل المرئي عبر الماك'
    }
  }

  if (!best || hasArabicMojibake(best.text)) {
    const tried: string[] = []
    if (googleFailAr) tried.push(`Google: ${googleFailAr}`)
    if (cloudFailAr) tried.push(`CloudConvert: ${cloudFailAr}`)
    if (loFailAr) tried.push(`LibreOffice: ${loFailAr}`)
    if (ocrFailAr) tried.push(`OCR: ${ocrFailAr}`)
    if (macFailAr) tried.push(`مرئي/ماك: ${macFailAr}`)
    throw new Error(
      [
        brokenToUnicodeErrorAr({
          hasMac: macSyncConfigured(),
          hasGoogleHint: true,
          hasLibreOffice: loOk,
        }),
        tried.length ? `محاولات: ${tried.join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    )
  }

  const text = best.text
  const quality = best.quality

  // Structured MSA paragraphs for Word
  const structuredParas = structureArabicParagraphs(text)
  let paragraphs: Array<{ text: string; heading?: 1 | 2 }> | string[] =
    structuredParas.length
      ? structuredParas
      : text
          .replace(/\r\n/g, '\n')
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)

  const paragraphStrings = paragraphs.map((p) =>
    typeof p === 'string' ? p : p.text
  )

  // Re-check page texts for xlsx/pptx — only use clean page text
  const cleanPages = paged.pages
    .map((p) => ({
      ...p,
      text: hasArabicMojibake(p.text) ? '' : p.text,
    }))
    .filter((p) => p.text.trim().length > 0)
  // Prefer whole-document clean text split for sheets/slides when pages were garbage
  const pageSource =
    cleanPages.length > 0
      ? cleanPages
      : paragraphStrings.map((t, i) => ({
          text: t,
          labelAr: `مقطع ${i + 1}`,
          index: i + 1,
        }))

  let sheets:
    | Array<{ name?: string; rows: Array<Array<string>> }>
    | undefined
  let slides: Array<{ title: string; bullets?: string[] }> | undefined
  let tables: Array<{ title?: string; rows: string[][] }> | undefined

  if (toFormat === 'xlsx') {
    const structured = textPagesToSheetRows(
      pageSource.map((p) => ({
        text: p.text,
        labelAr: 'labelAr' in p ? p.labelAr : undefined,
        index: 'index' in p ? p.index : undefined,
      }))
    )
    sheets =
      structured.length > 0
        ? structured
        : [
            {
              name: 'مستخرج',
              rows: paragraphStrings.map((p) => [p]),
            },
          ]
  }

  if (
    (fromFormat === 'xlsx' || fromFormat === 'csv') &&
    (toFormat === 'docx' || toFormat === 'txt' || toFormat === 'md')
  ) {
    const fromSheets = textPagesToSheetRows(
      paged.pages.map((p) => ({
        text: p.text,
        labelAr: p.labelAr,
        index: p.index,
      }))
    )
    if (fromSheets.length) {
      const blocks = sheetsToDocxBlocks(fromSheets)
      if (blocks.tables.length) tables = blocks.tables
      if (blocks.paragraphs.length) {
        paragraphs = blocks.paragraphs
      }
    }
  }

  if (toFormat === 'pptx') {
    slides = pageSource.slice(0, 40).map((p, i) => {
      const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean)
      const label =
        'labelAr' in p && p.labelAr ? p.labelAr : `شريحة ${i + 1}`
      return {
        title: lines[0]?.slice(0, 120) || label,
        bullets: lines.slice(1, 12),
      }
    })
    if (!slides.length) {
      slides = paragraphStrings.slice(0, 20).map((p, i) => ({
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
      toFormat === 'docx' || toFormat === 'txt' || toFormat === 'md'
        ? paragraphs
        : undefined,
    body: paragraphStrings.join('\n\n'),
    sheets,
    tables: toFormat === 'docx' ? tables : undefined,
    slides,
  })

  // Final absolute gate on rebuilt Office text
  if (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx') {
    const outCheck = await extractDocumentText({
      buffer: built.buffer,
      filename,
      mimeType: built.mimeType,
      enableOcr: false,
    })
    if (hasArabicMojibake(outCheck.text || '')) {
      throw new Error(
        'رُفض تسليم الملف: الناتج بعد إعادة البناء ما زال يحتوي طلاسم عربية. لن نُرجع DOCX/Excel/PPTX فاسداً.'
      )
    }
  }

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: built.buffer,
    originalName: filename,
    mimeType: built.mimeType,
    markEdited: true,
  })

  const fromDriveReject = Boolean(googleFailAr && /طلاسم|معطوب|Drive/.test(googleFailAr))
  const structuredNote =
    toFormat === 'xlsx'
      ? 'صفوف Excel من نص عربي نظيف فقط.'
      : tables?.length
        ? `جداول Word من ${tables.length} ورقة.`
        : fromDriveReject
          ? 'إعادة بناء Word مهنية من pdf-parse-safe بعد رفض طلاسم Drive.'
          : 'إعادة بناء نصية عربية نظيفة (RTL · عناوين) — بلا طلاسم.'

  return attachmentResult({
    saved,
    scopeId,
    fromFormat,
    toFormat,
    engine: ocrUsed ? 'ocr-rebuild' : 'free-rebuild',
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} — ${structuredNote} نزّل أو عاين من فقاعة الشات — تم التعديل.`,
    noteAr:
      'محرّك نظيف فقط. Drive المعطوب وpdf-lib العربي وpdf2docx للعربية معطّلة. التخطيط الأصلي 100٪ غير مضمون مجاناً؛ النص بلا طلاسم.',
    extra: {
      charCount: text.length,
      paragraphCount: paragraphStrings.length,
      tableCount: tables?.length || 0,
      sheetCount: sheets?.length || 0,
      extractMethod,
      ocrUsed,
      textSource: best.source,
      qualityPercent: {
        layout: tables?.length ? 35 : 15,
        editableText: 90,
        mojibake: 0,
      },
      priorEngineFailures: {
        google: googleFailAr,
        cloudconvert: cloudFailAr,
        libreoffice: loFailAr,
        macVisual: macFailAr,
        ocr: ocrFailAr,
      },
      arabicQuality: {
        broken: quality.broken,
        brokenHits: quality.brokenHits,
        mojibakeHits: quality.mojibakeHits,
      },
    },
  })
}

/** Alias used by agents / prompts as convert_file. */
export const executeConvertFile = executeConvertDocument
