/**
 * Focused PDF→Word clean-or-refuse check for اللائحة.
 * Usage: node --import tsx scripts/stress-bylaws-pdf-word.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const quality = unwrap(await import('../lib/documents/arabic-text-quality.ts'))
const extract = unwrap(await import('../lib/rag/extract.ts'))
const cloud = unwrap(await import('../lib/storage/cloud.ts'))
const convertTools = unwrap(
  await import('../lib/agents/tools/convert-document.ts')
)

const { assessArabicTextQuality, hasArabicMojibake } = quality
const { extractDocumentText } = extract
const { saveCloudFile } = cloud
const { executeConvertDocument } = convertTools

if (!existsSync(SOURCE_PATH)) {
  console.error('missing source PDF', SOURCE_PATH)
  process.exit(1)
}

const srcBuf = readFileSync(SOURCE_PATH)
const srcEx = await extractDocumentText({
  buffer: srcBuf,
  filename: 'STRESS_لائحة.pdf',
  mimeType: 'application/pdf',
  enableOcr: false,
})
const srcQ = assessArabicTextQuality(srcEx.text || '')
console.log('LOCAL_EXTRACT', {
  chars: (srcEx.text || '').length,
  broken: srcQ.broken,
  mojibake: hasArabicMojibake(srcEx.text || ''),
  hasClean: (srcEx.text || '').includes('اللائحة'),
  hasBad: (srcEx.text || '').includes('الالئحة'),
  sample: (srcEx.text || '').replace(/\s+/g, ' ').slice(0, 160),
})

const saved = await saveCloudFile({
  scopeId: SCOPE,
  buffer: srcBuf,
  originalName: 'STRESS_لائحة_بوابة_جودة_مصدر.pdf',
  mimeType: 'application/pdf',
  markEdited: false,
  editedBy: 'stress-pdf-word',
})
if (!saved.ok) throw new Error(saved.error)

const result = await executeConvertDocument('convert_document', {
  scopeId: SCOPE,
  fileId: saved.file.id,
  toFormat: 'docx',
  engine: 'auto',
  userId: OWNER_USER_ID,
  outputName: 'STRESS_لائحة_بوابة_جودة.docx',
})

if (!result || result.ok === false) {
  console.error('REFUSED (honest)', {
    reason_ar: result?.reason_ar || result?.messageAr || result?.error,
    result,
  })
  process.exit(1)
}

const out = await (
  await import('../lib/documents/workspace.ts')
).then((m) => unwrap(m).readWorkspaceFile(SCOPE, result.fileId))
if (!out?.buffer) {
  console.error('missing output', result)
  process.exit(1)
}
const docxText = await extractDocumentText({
  buffer: out.buffer,
  filename: result.name,
  mimeType: result.mimeType,
  enableOcr: false,
})
const outQ = assessArabicTextQuality(docxText.text || '')
const report = {
  engine: result.engine,
  messageAr: result.messageAr,
  noteAr: result.noteAr,
  extra: result.extra,
  chars: (docxText.text || '').length,
  broken: outQ.broken,
  mojibake: hasArabicMojibake(docxText.text || ''),
  hasAlLaiha: (docxText.text || '').includes('اللائحة'),
  hasBadLaiha: (docxText.text || '').includes('الالئحة'),
  hasAsasiya: (docxText.text || '').includes('الأساسية'),
  hasBadAsasiya: (docxText.text || '').includes('األساسية'),
  sample: (docxText.text || '').replace(/\s+/g, ' ').slice(0, 220),
}
writeFileSync(
  resolve(OUT, 'stress-pdf-word-gate.json'),
  JSON.stringify(report, null, 2)
)
console.log(JSON.stringify(report, null, 2))

const ok =
  !report.mojibake &&
  !report.broken &&
  report.hasAlLaiha &&
  !report.hasBadLaiha &&
  !report.hasBadAsasiya &&
  (result.engine === 'free-rebuild' ||
    result.engine === 'ocr-rebuild' ||
    result.engine === 'google-drive')

if (!ok) {
  console.error('FAIL quality gate')
  process.exit(2)
}
console.log('PASS clean Arabic Word')
