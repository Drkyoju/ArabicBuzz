/**
 * One-shot: upload visual DOCX to cloud storage + insert room post with preview/download marker.
 * Usage: node --import tsx scripts/post-visual-docx-to-room.mjs [path-to-docx]
 */
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: '.env.local' })

const docxPath = resolve(
  process.argv[2] || 'tmp/اللائحة_الاساسية_محدثة_التويمان_مرئي.docx'
)

async function main() {
  const { saveCloudFile } = await import('../lib/storage/cloud.ts')
  const { insertRoomPost } = await import('../lib/rooms/persist.ts')
  const { formatDownloadMarker } = await import('../lib/files/file-markers.ts')

  const buf = readFileSync(docxPath)
  const name = 'اللائحة_الاساسية_محدثة_التويمان_مرئي.docx'
  const mime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const saved = await saveCloudFile({
    scopeId: 'shared-demo',
    buffer: buf,
    originalName: name,
    mimeType: mime,
    markEdited: true,
    editedBy: 'agent',
  })
  if (!saved.ok) {
    console.error('save failed', saved.error)
    process.exit(1)
  }
  console.log('file', saved.file.id, saved.file.size)

  const marker = formatDownloadMarker({
    name,
    fileId: saved.file.id,
    edited: true,
    kind: 'edited',
  })
  const content = [
    'Word مرئي مطابق لتخطيط PDF (صورة لكل صفحة · 37 صفحة · بلا طلاسم).',
    '',
    'الحكم: التخطيط المرئي **100٪**. نص قابل للتحرير بنفس التخطيط غير متاح من طبقة ToUnicode المعطوبة — اربط Google Drive للتحرير النصي.',
    '',
    marker,
  ].join('\n')

  const post = await insertRoomPost({
    scopeId: 'shared-demo',
    authorKind: 'agent',
    authorId: 'system-convert',
    authorNameAr: 'وكيل الملفات',
    content,
  })
  console.log('post', post)
  if (!post.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
