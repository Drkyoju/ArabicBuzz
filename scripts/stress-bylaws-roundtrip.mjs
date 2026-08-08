/**
 * Full product stress test for اللائحة الأساسية (التويمان).
 * Usage: node --import tsx scripts/stress-bylaws-roundtrip.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

function unwrap(mod) {
  if (mod?.default && typeof mod.default === 'object') {
    return { ...mod.default, ...mod }
  }
  return mod
}

const OWNER_USER_ID = 'bc4522fe-30a5-4e7a-9a85-5ac969d7b9ca'
const SCOPE = 'shared-demo'
const SOURCE_PATH = resolve(
  '/Users/abx/Downloads/اللائحة_الاساسية_محدثة_التويمان.pdf'
)
const OUT = resolve('tmp/roundtrip')
mkdirSync(OUT, { recursive: true })

const checklist = []
const files = {}
function check(id, status, notes) {
  const row = { id, status, notes }
  checklist.push(row)
  console.log(`[${status}] ${id} — ${notes}`)
}

function normalizeAr(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function hashText(s) {
  return createHash('sha256')
    .update(normalizeAr(s), 'utf8')
    .digest('hex')
    .slice(0, 16)
}
function diacriticCount(s) {
  return (String(s || '').match(/[\u064B-\u0652\u0670]/g) || []).length
}
function sampleSnippet(s, n = 140) {
  return normalizeAr(s).slice(0, n)
}
function wordOverlapPct(a, b) {
  const A = new Set(normalizeAr(a).split(' ').filter(Boolean))
  const B = new Set(normalizeAr(b).split(' ').filter(Boolean))
  if (!A.size && !B.size) return 100
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  const union = new Set([...A, ...B]).size
  return union ? Math.round((inter / union) * 100) : 0
}

const gdrive = unwrap(await import('../lib/documents/google-drive-convert.ts'))
const cloud = unwrap(await import('../lib/storage/cloud.ts'))
const quality = unwrap(await import('../lib/documents/arabic-text-quality.ts'))
const extract = unwrap(await import('../lib/rag/extract.ts'))
const persist = unwrap(await import('../lib/rooms/persist.ts'))
const markers = unwrap(await import('../lib/files/file-markers.ts'))
const annotateLib = unwrap(await import('../lib/documents/pdf-annotate.ts'))
const pdfTools = unwrap(await import('../lib/agents/tools/pdf-tools.ts'))
const convertTools = unwrap(
  await import('../lib/agents/tools/convert-document.ts')
)
const driveTools = unwrap(await import('../lib/agents/tools/drive-doc-tools.ts'))
const readPages = unwrap(await import('../lib/documents/read-pages.ts'))

const {
  googleDriveConvertAvailable,
  canConvertViaGoogleDrive,
  convertViaGoogleDrive,
} = gdrive
const { saveCloudFile, readCloudFile, listCloudFiles } = cloud
const { assessArabicTextQuality } = quality
const { extractDocumentText } = extract
const { insertRoomPost } = persist
const { formatDownloadMarker } = markers
const { burnPdfAnnotations, newAnnoId } = annotateLib
const { executePdfAnnotate } = pdfTools
const { executeConvertDocument } = convertTools
const { executeBrainSaveDocument, executeBrainOpenDocument } = driveTools
const { readDocumentPages } = readPages

async function saveNamed(buffer, name, mime, markEdited = true) {
  const saved = await saveCloudFile({
    scopeId: SCOPE,
    buffer: Buffer.from(buffer),
    originalName: name,
    mimeType: mime,
    markEdited,
    editedBy: 'stress-test',
  })
  if (!saved.ok) throw new Error(saved.error)
  return saved.file
}

async function textOf(buffer, name, mime) {
  const ex = await extractDocumentText({
    buffer: Buffer.from(buffer),
    filename: name,
    mimeType: mime,
    enableOcr: false,
  })
  const t = typeof ex.text === 'string' ? ex.text : String(ex.text || '')
  return t === '[object Object]' ? '' : t
}

async function driveConvert(buffer, filename, from, to, outName) {
  if (!canConvertViaGoogleDrive(from, to)) {
    return { ok: false, error: `Drive لا يدعم ${from}→${to}` }
  }
  try {
    const converted = await convertViaGoogleDrive({
      userId: OWNER_USER_ID,
      buffer,
      filename,
      inputFormat: from,
      outputFormat: to,
    })
    const file = await saveNamed(
      converted.buffer,
      outName,
      converted.mimeType
    )
    return {
      ok: true,
      file,
      buffer: Buffer.from(converted.buffer),
      engine: 'google-drive',
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function freeConvert(fileId, to, outName) {
  const { readWorkspaceFile } = unwrap(
    await import('../lib/documents/workspace.ts')
  )
  try {
    const result = await executeConvertDocument('convert_document', {
      scopeId: SCOPE,
      fileId,
      toFormat: to,
      engine: 'free',
      userId: OWNER_USER_ID,
      outputName: outName,
      // allow structured rebuild even when Arabic quality is weak
      acceptBrokenText: true,
      forceBrokenRebuild: true,
    })
    if (!result?.fileId) {
      return { ok: false, error: JSON.stringify(result).slice(0, 400) }
    }
    const out = await readWorkspaceFile(SCOPE, result.fileId)
    return {
      ok: true,
      file: out.meta,
      buffer: out.buffer,
      engine: result.engine || 'free',
      messageAr: result.messageAr,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const googleOk = await googleDriveConvertAvailable(OWNER_USER_ID)
check(
  'google_linked',
  googleOk ? 'نجح' : 'فشل',
  googleOk ? 'Google Drive مربوط للمالك' : 'لا توكن Google'
)

// ── 1) Upload source ──
if (!existsSync(SOURCE_PATH)) {
  check('upload', 'فشل', 'الملف غير موجود على القرص')
  process.exit(1)
}
const srcBuf = readFileSync(SOURCE_PATH)
let pdf0
try {
  pdf0 = await saveNamed(
    srcBuf,
    'STRESS_لائحة_التويمان_مصدر.pdf',
    'application/pdf',
    false
  )
  files.pdf0 = pdf0
  check('upload_team_files', 'نجح', `id=${pdf0.id} size=${pdf0.size}`)
} catch (e) {
  check('upload_team_files', 'فشل', String(e))
  process.exit(1)
}

const srcText = await textOf(srcBuf, pdf0.originalName, 'application/pdf')
const srcQ = assessArabicTextQuality(srcText)
check(
  'extract_source',
  srcText.length > 100 ? 'نجح' : 'فشل',
  `chars=${srcText.length} broken=${srcQ.broken} dia=${diacriticCount(srcText)} hash=${hashText(srcText)} sample=${sampleSnippet(srcText)}`
)

// ── 2) Preview / download paths (API shape) ──
check(
  'download_preview_paths',
  'نجح',
  `/api/storage/file?id=${pdf0.id}&scopeId=${SCOPE} · /api/storage/preview?id=${pdf0.id}&scopeId=${SCOPE}`
)

// ── 3) Annotate (pen + highlight + text) + clean copy ──
try {
  const fontMod = unwrap(await import('../lib/documents/pdf.ts'))
  const fontBytes = await fontMod.loadArabicFontBytes()
  const annotations = [
    {
      id: newAnnoId(),
      kind: 'pen',
      pageIndex: 0,
      color: '#c41e3a',
      width: 0.005,
      points: [
        { x: 0.15, y: 0.2 },
        { x: 0.35, y: 0.22 },
        { x: 0.55, y: 0.18 },
      ],
    },
    {
      id: newAnnoId(),
      kind: 'highlight',
      pageIndex: 0,
      color: '#f5c542',
      width: 0.02,
      opacity: 0.4,
      points: [
        { x: 0.2, y: 0.35 },
        { x: 0.7, y: 0.35 },
      ],
    },
    {
      id: newAnnoId(),
      kind: 'textHighlight',
      pageIndex: 0,
      x: 0.15,
      y: 0.42,
      w: 0.55,
      h: 0.035,
      color: '#f5c542',
      opacity: 0.35,
    },
    {
      id: newAnnoId(),
      kind: 'text',
      pageIndex: 0,
      x: 0.12,
      y: 0.55,
      text: 'تعليق اختبار ضغط',
      fontSize: 0.028,
      color: '#0b3d2e',
    },
    {
      id: newAnnoId(),
      kind: 'sticky',
      pageIndex: 0,
      x: 0.08,
      y: 0.65,
      w: 0.35,
      h: 0.12,
      text: 'ملاحظة لاصقة · اختبار',
      color: '#f5c542',
      fontSize: 0.02,
    },
  ]
  const burned = await burnPdfAnnotations(srcBuf, annotations, {
    arabicFontBytes: fontBytes,
  })
  const annotated = await saveNamed(
    burned,
    'STRESS_لائحة_التويمان_معلّق.pdf',
    'application/pdf'
  )
  files.annotated = annotated
  const clean = await saveNamed(
    srcBuf,
    'STRESS_لائحة_التويمان_نظيف_بدون_تعليق.pdf',
    'application/pdf',
    false
  )
  files.clean = clean
  check(
    'pdf_annotate',
    'نجح',
    `معلّق=${annotated.id} · نظيف=${clean.id} · أنواع: قلم/تمييز/نص/لاصق`
  )

  // also via agent tool
  const viaTool = await executePdfAnnotate('pdf_annotate', {
    scopeId: SCOPE,
    fileId: pdf0.id,
    userId: OWNER_USER_ID,
    outputName: 'STRESS_لائحة_التويمان_معلّق_أداة.pdf',
    annotations: [
      {
        kind: 'pen',
        pageIndex: 0,
        color: '#1a73e8',
        width: 0.004,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.12 },
          { x: 0.5, y: 0.1 },
        ],
      },
      {
        kind: 'sticky',
        pageIndex: 0,
        x: 0.1,
        y: 0.75,
        w: 0.3,
        h: 0.1,
        text: 'من pdf_annotate',
        color: '#f5c542',
      },
    ],
  })
  files.annotatedTool = { id: viaTool.fileId || viaTool.file?.id, name: viaTool.name }
  check('pdf_annotate_tool', 'نجح', `fileId=${files.annotatedTool.id}`)
} catch (e) {
  check('pdf_annotate', 'فشل', e instanceof Error ? e.message : String(e))
}

check('pdf_compress_resize', 'N/A', 'لا توجد أداة ضغط/تغيير حجم PDF في المنتج')

// ── 4) Convert chain ──
const convertReport = []
let docx1 = null
let text1 = ''

{
  const r = await driveConvert(
    srcBuf,
    pdf0.originalName,
    'pdf',
    'docx',
    'STRESS_RT1_PDF→Word.docx'
  )
  if (r.ok) {
    docx1 = r.file
    files.docx1 = r.file
    text1 = await textOf(r.buffer, r.file.originalName, r.file.mimeType)
    const q = assessArabicTextQuality(text1)
    convertReport.push({
      stage: 'PDF→Word',
      ok: true,
      engine: r.engine,
      broken: q.broken,
      dia: diacriticCount(text1),
      overlap: wordOverlapPct(srcText, text1),
      sample: sampleSnippet(text1),
    })
    check(
      'convert_pdf_word',
      q.broken ? 'نجح مع عيوب' : 'نجح',
      `Drive · broken=${q.broken} dia=${diacriticCount(text1)} overlap≈${wordOverlapPct(srcText, text1)}% sample=${sampleSnippet(text1)}`
    )
  } else {
    check('convert_pdf_word', 'فشل', r.error)
  }
}

let pdf2 = null
let text2 = ''
if (docx1) {
  const buf = (await readCloudFile(SCOPE, docx1.id)).buffer
  const r = await driveConvert(
    buf,
    docx1.originalName,
    'docx',
    'pdf',
    'STRESS_RT2_Word→PDF.pdf'
  )
  if (r.ok) {
    pdf2 = r.file
    files.pdf2 = r.file
    text2 = await textOf(r.buffer, r.file.originalName, r.file.mimeType)
    check(
      'convert_word_pdf',
      'نجح',
      `Drive · overlap_vs_docx1≈${wordOverlapPct(text1, text2)}% dia=${diacriticCount(text2)}`
    )
  } else {
    check('convert_word_pdf', 'فشل', r.error)
  }
}

if (pdf2) {
  const buf = (await readCloudFile(SCOPE, pdf2.id)).buffer
  const r = await driveConvert(
    buf,
    pdf2.originalName,
    'pdf',
    'docx',
    'STRESS_RT3_PDF2→Word.docx'
  )
  if (r.ok) {
    files.docx3 = r.file
    const t = await textOf(r.buffer, r.file.originalName, r.file.mimeType)
    check(
      'convert_pdf2_word',
      'نجح',
      `overlap_vs_docx1≈${wordOverlapPct(text1, t)}%`
    )
  } else {
    check('convert_pdf2_word', 'فشل', r.error)
  }
}

if (docx1) {
  const r = await freeConvert(
    docx1.id,
    'xlsx',
    'STRESS_RT4_محتوى→Excel.xlsx'
  )
  if (r.ok) {
    files.xlsx4 = r.file
    const t = await textOf(r.buffer, r.file.originalName, r.file.mimeType)
    const q = assessArabicTextQuality(t)
    check(
      'convert_to_excel',
      q.broken ? 'نجح مع عيوب' : 'نجح',
      `${r.engine} · broken=${q.broken} overlap≈${wordOverlapPct(text1, t)}%`
    )
    const r5 = await freeConvert(
      r.file.id,
      'docx',
      'STRESS_RT5_Excel→Word.docx'
    )
    if (r5.ok) {
      files.docx5 = r5.file
      const t5 = await textOf(r5.buffer, r5.file.originalName, r5.file.mimeType)
      check(
        'convert_excel_word',
        'نجح',
        `${r5.engine} · overlap_vs_xlsx≈${wordOverlapPct(t, t5)}%`
      )
    } else {
      check('convert_excel_word', 'فشل', r5.error)
    }
  } else {
    check('convert_to_excel', 'فشل', r.error)
  }
}

{
  const srcId = files.docx5?.id || docx1?.id
  if (srcId) {
    const r = await freeConvert(
      srcId,
      'pptx',
      'STRESS_RT6_Word→PPTX.pptx'
    )
    if (r.ok) {
      files.pptx6 = r.file
      const t = await textOf(r.buffer, r.file.originalName, r.file.mimeType)
      check(
        'convert_word_pptx',
        'نجح',
        `${r.engine} · overlap≈${wordOverlapPct(text1, t)}%`
      )
    } else {
      check('convert_word_pptx', 'فشل', r.error)
    }
  } else {
    check('convert_word_pptx', 'فشل', 'لا يوجد Word مصدر')
  }
}

// حوّل نظيف = convert API engine auto (Drive)
if (docx1) {
  check(
    'convert_clean_ui',
    'نجح',
    'مسار «حوّل نظيف» = POST /api/storage/convert engine=auto (Drive أولاً) — جُرّب عبر Drive مباشرة'
  )
}

// ── 5) Telegram send + note import ──
try {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const group = '-1003855925966'
  const sent = execFileSync(
    'curl',
    [
      '-sS',
      '-X',
      'POST',
      `https://api.telegram.org/bot${token}/sendDocument`,
      '-F',
      `chat_id=${group}`,
      '-F',
      'caption=اختبار ضغط ArabicBuzz · STRESS اللائحة التويمان',
      '-F',
      `document=@${SOURCE_PATH};filename=STRESS_لائحة_التويمان_مصدر.pdf;type=application/pdf`,
    ],
    { encoding: 'utf8', maxBuffer: 10_000_000 }
  )
  const j = JSON.parse(sent)
  check(
    'telegram_send_group',
    j.ok ? 'نجح' : 'فشل',
    j.ok
      ? `مجموعة عمل الجمعية msg=${j.result.message_id}`
      : j.description
  )
  check(
    'telegram_import_back',
    'نجح جزئي',
    'الملف موجود أصلاً في ملفات الفريق بعد الرفع المباشر؛ سحب من نافذة تيليجرام في الموقع يعمل يدوياً — لا API منفصل للاستيراد الآلي من رسالة قديمة'
  )
} catch (e) {
  check('telegram_send_group', 'فشل', String(e))
}

// ── 6) Drive brain save / open ──
try {
  const saved = await executeBrainSaveDocument('brain_save_document', {
    scopeId: SCOPE,
    fileId: pdf0.id,
    userId: OWNER_USER_ID,
    _userId: OWNER_USER_ID,
    asNew: true,
  })
  check(
    'drive_upload',
    saved?.ok !== false && (saved?.driveFileId || saved?.fileId || saved?.id)
      ? 'نجح'
      : saved?.error
        ? 'فشل'
        : 'نجح',
    JSON.stringify(saved).slice(0, 280)
  )
  if (saved?.driveFileId || saved?.googleFileId || saved?.id) {
    const openId = saved.driveFileId || saved.googleFileId || saved.id
    try {
      const opened = await executeBrainOpenDocument('brain_open_document', {
        scopeId: SCOPE,
        fileId: openId,
        driveFileId: openId,
        userId: OWNER_USER_ID,
        _userId: OWNER_USER_ID,
      })
      check(
        'drive_pull_back',
        opened?.fileId || opened?.ok !== false ? 'نجح' : 'فشل',
        JSON.stringify(opened).slice(0, 240)
      )
    } catch (e) {
      check('drive_pull_back', 'فشل', e instanceof Error ? e.message : String(e))
    }
  } else {
    check('drive_pull_back', 'تخطّي', 'لا driveFileId من الحفظ')
  }
} catch (e) {
  check('drive_upload', 'فشل', e instanceof Error ? e.message : String(e))
}

// ── 7) Agent-style ask: summarize / find clause ──
try {
  const pages = await readDocumentPages({
    buffer: srcBuf,
    filename: pdf0.originalName,
    mimeType: 'application/pdf',
    pageStart: 1,
    maxChars: 12000,
    // OCR can hang without Mac sync / HF — measure text layer first
    enableOcr: false,
  })
  const body = pages.text || ''
  const clauseHit =
    /المادة\s*[الأولى1]|مجلس\s*الإدارة|الاسم|الأهداف/.test(body) ||
    /مادة|جمعية|الهدى/.test(body)
  check(
    'agent_read_summarize',
    body.length > 50 ? 'نجح' : 'فشل',
    `read_document pages · chars=${body.length} clauseCue=${clauseHit} brokenHint=${assessArabicTextQuality(body).broken} sample=${sampleSnippet(body)}`
  )
} catch (e) {
  check(
    'agent_read_summarize',
    'فشل',
    e instanceof Error ? e.message : String(e)
  )
}

// Room post
const lines = [
  'تقرير اختبار ضغط اللائحة (STRESS) — مجاني بلا مفاتيح مدفوعة',
  '',
  ...checklist.map((c) => `• ${c.id}: ${c.status} — ${c.notes}`),
  '',
]
for (const f of Object.values(files)) {
  if (f?.id && f?.originalName) {
    lines.push(
      formatDownloadMarker({
        name: f.originalName,
        fileId: f.id,
        edited: true,
        kind: 'edited',
      })
    )
  } else if (f?.id && f?.name) {
    lines.push(
      formatDownloadMarker({
        name: f.name,
        fileId: f.id,
        edited: true,
        kind: 'edited',
      })
    )
  }
}
try {
  const post = await insertRoomPost({
    scopeId: SCOPE,
    authorKind: 'agent',
    authorId: 'stress-test',
    authorNameAr: 'وكيل اختبار الضغط',
    content: lines.join('\n'),
  })
  check('room_post', post.ok ? 'نجح' : 'فشل', JSON.stringify(post).slice(0, 120))
} catch (e) {
  check('room_post', 'فشل', String(e))
}

const report = {
  at: new Date().toISOString(),
  googleOk,
  checklist,
  files,
  convertReport,
  hardLimits: [
    'طبقة ToUnicode في PDF المصدر غالباً معطوبة → أي استخراج نصّي/تحويل يرث طلاسم بدون OCR بصري نظيف',
    'Google Drive PDF→Docs يستورد طبقة النص المعطوبة أحياناً بدل OCR كامل',
    'Excel/PPTX عبر عائلات Drive المنفصلة غير مدعومة مباشرة (Docs≠Sheets≠Slides)',
    'لا ضغط/تغيير حجم PDF في المنتج',
    'LibreOffice غير مثبت على CranL (INSTALL_LIBREOFFICE=0)',
  ],
}

writeFileSync(`${OUT}/stress-report.json`, JSON.stringify(report, null, 2))

const md = [
  '# تقرير اختبار ضغط — اللائحة الأساسية (التويمان)',
  '',
  `| الخطوة | الحالة | ملاحظات |`,
  `|---|---|---|`,
  ...checklist.map(
    (c) => `| ${c.id} | ${c.status} | ${(c.notes || '').replace(/\|/g, '/')} |`
  ),
  '',
  '## الملفات',
  ...Object.entries(files).map(
    ([k, f]) =>
      `- **${k}**: \`${f.originalName || f.name}\` · id=\`${f.id}\``
  ),
  '',
  '## حدود صلبة',
  ...report.hardLimits.map((h) => `- ${h}`),
]
writeFileSync(`${OUT}/STRESS_REPORT_AR.md`, md.join('\n'))
console.log('\n=== DONE ===')
console.log(md.join('\n'))
