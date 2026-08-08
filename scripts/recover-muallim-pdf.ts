/**
 * Best-effort recovery: المعلم الأول — duplicate page 48 after 45.
 *
 * Usage:
 *   npx tsx scripts/recover-muallim-pdf.ts
 *
 * Looks for exact filename in room vault / Drive brain, runs pdf_duplicate_page,
 * saves result. Does NOT substitute biology guide. Does NOT deleteMessage.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
config({ path: '.env' })

import { matchWorkspaceFileExact } from '@/lib/files/file-source-policy'
import { duplicatePdfPageAfter } from '@/lib/documents/pdf'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { enqueueTelegramFileJob } from '@/lib/telegram/file-jobs'
import { searchDriveBrainExactName } from '@/lib/telegram/drive-exact-recover'

const EXPECTED_NAMES = [
  'المعلم الاول.pdf',
  'المعلم الأول.pdf',
  'المعلم الاول',
  'المعلم الأول',
]

async function main() {
  const scopeId =
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() ||
    process.env.RECOVER_SCOPE_ID?.trim() ||
    'shared-demo'
  const chatId = process.env.RECOVER_CHAT_ID?.trim() || ''

  console.log('scopeId=', scopeId)

  const files = await listWorkspaceFiles(scopeId)
  let hit =
    EXPECTED_NAMES.map((n) => matchWorkspaceFileExact(files, n)).find(Boolean) ||
    null

  if (!hit) {
    console.log('… not in room vault; trying Drive exact name')
    for (const n of EXPECTED_NAMES) {
      const d = await searchDriveBrainExactName({ scopeId, exactName: n })
      if (d) {
        hit = {
          id: d.vaultFileId,
          originalName: d.fileName,
          mimeType: 'application/pdf',
          source: 'cloud',
        }
        break
      }
    }
  }

  if (!hit) {
    console.error(
      'FAILED: لا بايتات لـ «المعلم الأول» في الغرفة ولا Drive بنفس الاسم. لن نستبدل بدليل الأحياء.'
    )
    if (chatId) {
      await enqueueTelegramFileJob({
        chatId,
        scopeId,
        requestText: 'كرر صفحة 48 بعد 45',
        expectedFilename: 'المعلم الاول.pdf',
        workKind: 'file',
        workParams: { copyPage: 48, afterPage: 45 },
        status: 'waiting_file',
      })
      console.log('Enqueued waiting_file job for chat', chatId)
    }
    process.exit(2)
  }

  console.log('Found:', hit.originalName, hit.id)
  const { buffer } = await readWorkspaceFile(scopeId, hit.id)
  const out = await duplicatePdfPageAfter({
    pdf: buffer,
    copyPage: 48,
    afterPage: 45,
  })
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: out.buffer,
    originalName: hit.originalName.replace(/\.pdf$/i, '') + '-صفحة48-بعد45.pdf',
    mimeType: 'application/pdf',
  })
  console.log(
    'OK:',
    saved.file.originalName,
    saved.file.id,
    `pages ${out.pageCountBefore}→${out.pageCountAfter}`
  )
  console.log(
    'أرسل الملف من تيليجرام عبر return_file/sendDocument من الغرفة أو اطلب من البوت إرساله.'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
