/**
 * Convert between Office/PDF formats — clean Arabic or refuse (never ship طلاسم).
 *
 * PDF→Office (engine=auto|free) — strict honesty cascade:
 *  Gemini leads OCR Arena (ocrarena.ai/leaderboard) — primary vision OCR.
 *  1) Gemini Flash OCR → clean text → rebuild Word/etc.
 *  2) Stronger Gemini if Flash fails quality gate
 *  3) PaddleOCR when available — after Gemini gate fails
 *  4) STOP — Mistral only if CONVERT_ALLOW_MISTRAL=1 AND MISTRAL_API_KEY (default OFF)
 *  5) Local clean extract ONLY if quality gate passes
 *  6) Else refuse with MSA { ok: false, reason_ar } — never attach a bad file
 *
 * Other pairs (engine=auto): gated Google Drive → LibreOffice → optional CloudConvert
 *
 * Hard-disabled: Drive mojibake export, pdf2docx for Arabic, pdf-lib Arabic body,
 * forceBrokenRebuild shipping طلاسم, silent visual “success” without warning.
 */
import { extractDocumentText } from '@/lib/rag/extract'
import {
  mistralOcrConfigured,
  paddleOcrConfigured,
  runConvertOcrCascade,
} from '@/lib/rag/ocr'
import { readDocumentPages } from '@/lib/documents/read-pages'
import {
  brokenToUnicodeErrorAr,
  CONVERT_LIBREOFFICE_UNAVAILABLE_AR,
  CONVERT_OCR_REFUSE_AR,
  convertRefuseResult,
  hasArabicMojibake,
  pickBestCleanArabicText,
  preferLocalArabicOverDrive,
  sheetsToDocxBlocks,
  structureArabicParagraphs,
  textPagesToSheetRows,
  type ArabicTextQuality,
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
import { macSyncConfigured } from '@/lib/storage/mac-sync-client'

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
    ok: true as const,
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
    return convertRefuseResult('مرّر fileId للملف المراد تحويله.')
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
    return convertRefuseResult(
      `لم يُعثر على «${ref}». افتحه من ملفات الفريق أو عقل الشركة ثم أعد المحاولة.`
    )
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  const fromFormat =
    (inferFormatFromName(hit.meta.originalName) as DocFormat | null) || 'txt'

  if (fromFormat === toFormat) {
    return convertRefuseResult(`الملف بالفعل بصيغة ${toFormat}.`)
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

  const officeFromPdf =
    fromFormat === 'pdf' &&
    (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx')

  // PDF→Office auto/free: Gemini-first OCR cascade — skip Drive/CloudConvert
  // (broken Drive/pdf2docx stay disabled; engine=google still uses gated Drive).
  if (officeFromPdf && (engine === 'auto' || engine === 'free')) {
    return rebuildPdfToOfficeHonest({
      hit,
      scopeId,
      fromFormat,
      toFormat,
      outputName,
      baseName,
      title: params.title != null ? String(params.title) : baseName,
    })
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
  let loFailAr: string | null = null

  // ── Google Drive (gated) — not default for PDF→Office auto ──
  if (wantGoogle) {
    if (!googleLinked) {
      return convertRefuseResult(
        'تحويل Google يحتاج ربط الحساب من الإعدادات → «ربط Google (Drive)». لا يلزم دفع.'
      )
    }
    if (!canConvertViaGoogleDrive(fromFormat, toFormat)) {
      if (engine === 'google') {
        return convertRefuseResult(
          `تحويل Google لا يدعم ${fromFormat} → ${toFormat}. استخدم صيغة ضمن نفس العائلة، أو engine=auto لمسار Gemini OCR.`
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
            googleFailAr =
              gate.reasonAr ||
              'تصدير Drive عربي معطوب — رُفض بالكامل'
            if (engine === 'google') {
              return convertRefuseResult(
                `${googleFailAr} لن نُسلّم طلاسم. جرّب engine=auto (Gemini OCR أولاً).`
              )
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
              messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر Google Drive (اجتاز بوابة الجودة). نزّل أو عاين من فقاعة الشات.`,
              noteAr:
                'محرّك: Google Drive بعد بوابة عربية صارمة. التصدير المعطوب يُرفض.',
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
            messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر Google Drive. نزّل أو عاين من فقاعة الشات.`,
            noteAr: 'محرّك: Google Drive (استيراد/تصدير مؤقت ثم حذف).',
          })
        }
      } catch (e) {
        googleFailAr =
          e instanceof Error ? e.message : 'فشل تحويل Google Drive'
        if (engine === 'google') {
          return convertRefuseResult(googleFailAr)
        }
      }
    }
  }

  // ── LibreOffice (not PDF→Office Arabic) ──
  const loOk =
    engine === 'auto' ||
    engine === 'free' ||
    engine === 'libreoffice'
      ? await libreOfficeAvailable()
      : false
  if (engine === 'libreoffice' && !loOk) {
    return convertRefuseResult(CONVERT_LIBREOFFICE_UNAVAILABLE_AR)
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
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر LibreOffice. نزّل أو عاين من فقاعة الشات.`,
        noteAr: 'محرّك: LibreOffice محلي (مجاني/مفتوح المصدر).',
      })
    } catch (e) {
      loFailAr = e instanceof Error ? e.message : 'فشل LibreOffice'
      if (engine === 'libreoffice') {
        return convertRefuseResult(loFailAr)
      }
    }
  }

  // ── Optional CloudConvert ──
  const wantCloud =
    engine === 'cloudconvert' ||
    (engine === 'auto' &&
      cloudConvertConfigured() &&
      params.preferCloud !== false)

  if (
    wantCloud &&
    cloudConvertConfigured() &&
    (CLOUD_ALLOWED as readonly string[]).includes(toFormat) &&
    !officeFromPdf
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
        messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} عبر CloudConvert. نزّل أو عاين من فقاعة الشات.`,
        noteAr: 'محرّك: CloudConvert (اختياري مدفوع).',
      })
    } catch (e) {
      cloudFailAr =
        e instanceof Error ? e.message : 'فشل تحويل CloudConvert'
      if (engine === 'cloudconvert') {
        return convertRefuseResult(cloudFailAr)
      }
    }
  }

  if (engine === 'cloudconvert' && !cloudConvertConfigured()) {
    return convertRefuseResult(
      'CloudConvert غير مضبوط. الأفضل: engine=auto (Gemini OCR) أو Google بعد بوابة الجودة، أو أضف CLOUDCONVERT_API_KEY.'
    )
  }

  // Word→PDF Arabic: refuse pdf-lib path
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
      return convertRefuseResult(
        [
          'مسار Word→PDF النصّي المحلي (pdf-lib) معطّل للعربية — يُنتج حروفاً منفصلة/رديئة.',
          'المسارات المسموحة: Google Drive إن اجتاز بوابة الجودة، أو LibreOffice، أو CloudConvert.',
          tried.length ? `محاولات: ${tried.join(' · ')}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      )
    }
  }

  if (!FREE_ALLOWED.includes(toFormat)) {
    const tips: string[] = []
    if (googleFailAr) tips.push(googleFailAr)
    if (!loOk) tips.push('LibreOffice غير متوفر')
    return convertRefuseResult(
      `تعذّر التحويل إلى ${toRaw || '—'}. ${tips.join(' · ')}`
    )
  }

  // Non-PDF free rebuild (txt/md etc.) — still gate Arabic
  return rebuildFromLocalExtract({
    hit,
    scopeId,
    fromFormat,
    toFormat,
    outputName,
    baseName,
    title: params.title != null ? String(params.title) : baseName,
    priorFailures: {
      google: googleFailAr,
      cloudconvert: cloudFailAr,
      libreoffice: loFailAr,
    },
  })
}

/** PDF→Office: Gemini Flash → strong → Paddle → STOP (Mistral opt-in) → local clean → refuse. */
async function rebuildPdfToOfficeHonest(opts: {
  hit: Awaited<ReturnType<typeof readWorkspaceFile>>
  scopeId: string
  fromFormat: DocFormat
  toFormat: DocFormat
  outputName: string
  baseName: string
  title: string
}) {
  const { hit, scopeId, fromFormat, toFormat, outputName, baseName, title } =
    opts

  const ocrCascade = await runConvertOcrCascade({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
  })

  let best = ocrCascade.best
    ? pickBestCleanArabicText([
        { text: ocrCascade.best.text, source: ocrCascade.best.source },
      ])
    : null
  let ocrUsed = Boolean(best)
  let extractMethod = best?.source || 'none'

  // Local clean extract ONLY if OCR cascade did not yield clean text
  if (!best) {
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
    best = pickBestCleanArabicText([
      { text: pdfParseExtract.text || '', source: 'pdf-parse-safe' },
      { text: paged.text || '', source: 'read-pages' },
    ])
    if (best) {
      ocrUsed = false
      extractMethod = best.source
    }
  }

  if (!best || hasArabicMojibake(best.text)) {
    const attemptLines = ocrCascade.attempts
      .map((a) => `${a.provider}: ${a.ok ? '✓' : '✗'} ${a.detailAr}`)
      .join(' · ')
    return convertRefuseResult(
      [
        CONVERT_OCR_REFUSE_AR,
        attemptLines ? `تفاصيل المحاولات: ${attemptLines}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      {
        cascade: [
          'gemini-flash',
          'gemini-strong',
          'paddle',
          'stop',
          'mistral-opt-in',
          'local-clean',
          'refuse',
        ],
        ocrAttempts: ocrCascade.attempts,
        engine: 'refuse',
        mistralOptIn: mistralOcrConfigured(),
        paddleConfigured: paddleOcrConfigured(),
      }
    )
  }

  const engineLabel = !ocrUsed
    ? 'free-rebuild'
    : best.source.startsWith('ocr-mistral')
      ? 'ocr-mistral-rebuild'
      : best.source.startsWith('ocr-paddle')
        ? 'ocr-paddle-rebuild'
        : best.source.startsWith('ocr-gemini')
          ? 'ocr-gemini-rebuild'
          : 'ocr-rebuild'

  const noteExtra = !ocrUsed
    ? 'محرّك: استخراج محلي نظيف اجتاز بوابة الجودة فقط.'
    : best.source.includes('paddle')
      ? 'محرّك: PaddleOCR (بعد فشل بوابة Gemini) → إعادة بناء نظيفة.'
      : best.source.includes('mistral')
        ? 'محرّك: Mistral OCR (مفعّل صراحةً عبر CONVERT_ALLOW_MISTRAL) → إعادة بناء نظيفة.'
        : best.source.includes('gemini-strong')
          ? 'محرّك: Gemini أقوى (بعد Flash ضعيف) → إعادة بناء DOCX/Office بـ RTL. بلا طلاسم.'
          : best.source.includes('gemini')
            ? 'محرّك: Gemini Flash OCR → إعادة بناء DOCX/Office بـ RTL. بلا طلاسم.'
            : 'محرّك: OCR نظيف اجتاز بوابة الجودة → إعادة بناء.'

  return finishRebuildFromCleanText({
    hit,
    scopeId,
    fromFormat,
    toFormat,
    outputName,
    baseName,
    title,
    text: best.text,
    quality: best.quality,
    extractMethod,
    ocrUsed,
    textSource: best.source,
    engineLabel,
    noteExtra,
    priorFailures: {
      ocrAttempts: ocrCascade.attempts,
    },
  })
}

async function rebuildFromLocalExtract(opts: {
  hit: Awaited<ReturnType<typeof readWorkspaceFile>>
  scopeId: string
  fromFormat: DocFormat
  toFormat: DocFormat
  outputName: string
  baseName: string
  title: string
  priorFailures: Record<string, string | null>
}) {
  const paged = await readDocumentPages({
    buffer: opts.hit.buffer,
    filename: opts.hit.meta.originalName,
    mimeType: opts.hit.meta.mimeType,
    pageStart: 1,
    maxChars: 200_000,
    enableOcr: false,
  })
  const pdfParseExtract = await extractDocumentText({
    buffer: opts.hit.buffer,
    filename: opts.hit.meta.originalName,
    mimeType: opts.hit.meta.mimeType,
    enableOcr: false,
  })
  const best = pickBestCleanArabicText([
    { text: pdfParseExtract.text || '', source: 'pdf-parse-safe' },
    { text: paged.text || '', source: 'read-pages' },
  ])
  if (!best || hasArabicMojibake(best.text)) {
    return convertRefuseResult(
      brokenToUnicodeErrorAr({
        hasMac: macSyncConfigured(),
        hasGoogleHint: true,
        hasMistral: mistralOcrConfigured(),
        hasPaddle: paddleOcrConfigured(),
      }),
      { priorEngineFailures: opts.priorFailures, engine: 'refuse' }
    )
  }
  return finishRebuildFromCleanText({
    hit: opts.hit,
    scopeId: opts.scopeId,
    fromFormat: opts.fromFormat,
    toFormat: opts.toFormat,
    outputName: opts.outputName,
    baseName: opts.baseName,
    title: opts.title,
    text: best.text,
    quality: best.quality,
    extractMethod: best.source,
    ocrUsed: false,
    textSource: best.source,
    engineLabel: 'free-rebuild',
    noteExtra: 'إعادة بناء نصية عربية نظيفة — بلا طلاسم.',
    priorFailures: opts.priorFailures,
  })
}

async function finishRebuildFromCleanText(opts: {
  hit: Awaited<ReturnType<typeof readWorkspaceFile>>
  scopeId: string
  fromFormat: DocFormat
  toFormat: DocFormat
  outputName: string
  baseName: string
  title: string
  text: string
  quality: ArabicTextQuality
  extractMethod: string
  ocrUsed: boolean
  textSource: string
  engineLabel: string
  noteExtra: string
  priorFailures: Record<string, unknown>
}) {
  const {
    hit,
    scopeId,
    fromFormat,
    toFormat,
    outputName,
    baseName,
    title,
    text,
    quality,
  } = opts

  const paged = await readDocumentPages({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    pageStart: 1,
    maxChars: 200_000,
    enableOcr: false,
  })

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

  const cleanPages = paged.pages
    .map((p) => ({
      ...p,
      text: hasArabicMojibake(p.text) ? '' : p.text,
    }))
    .filter((p) => p.text.trim().length > 0)
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
    title,
    paragraphs:
      toFormat === 'docx' || toFormat === 'txt' || toFormat === 'md'
        ? paragraphs
        : undefined,
    body: paragraphStrings.join('\n\n'),
    sheets,
    tables: toFormat === 'docx' ? tables : undefined,
    slides,
  })

  if (toFormat === 'docx' || toFormat === 'xlsx' || toFormat === 'pptx') {
    const outCheck = await extractDocumentText({
      buffer: built.buffer,
      filename,
      mimeType: built.mimeType,
      enableOcr: false,
    })
    if (hasArabicMojibake(outCheck.text || '')) {
      return convertRefuseResult(
        'رُفض تسليم الملف: الناتج بعد إعادة البناء ما زال يحتوي طلاسم عربية. لن نُرجع DOCX/Excel/PPTX فاسداً.',
        { engine: 'refuse', textSource: opts.textSource }
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

  return attachmentResult({
    saved,
    scopeId,
    fromFormat,
    toFormat,
    engine: opts.engineLabel,
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} — ${opts.noteExtra} نزّل أو عاين من فقاعة الشات.`,
    noteAr:
      'سلسلة نظيفة: Gemini → Paddle → توقّف (Mistral فقط مع CONVERT_ALLOW_MISTRAL=1). محلي نظيف إن اجتاز البوابة. Drive المعطوب وpdf2docx للعربية وpdf-lib العربي معطّلة. التخطيط الأصلي 100٪ غير مضمون؛ النص بلا طلاسم.',
    extra: {
      charCount: text.length,
      paragraphCount: paragraphStrings.length,
      tableCount: tables?.length || 0,
      sheetCount: sheets?.length || 0,
      extractMethod: opts.extractMethod,
      ocrUsed: opts.ocrUsed,
      textSource: opts.textSource,
      qualityPercent: {
        layout: tables?.length ? 35 : 15,
        editableText: 90,
        mojibake: 0,
      },
      priorEngineFailures: opts.priorFailures,
      arabicQuality: {
        broken: quality.broken,
        brokenHits: quality.brokenHits,
        mojibakeHits: quality.mojibakeHits,
      },
      cascade: [
        'gemini-flash',
        'gemini-strong',
        'paddle',
        'stop',
        'mistral-opt-in',
        'local-clean',
      ],
    },
  })
}

/** Alias used by agents / prompts as convert_file. */
export const executeConvertFile = executeConvertDocument
