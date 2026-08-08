import { config } from 'dotenv'
config({ path: '.env.local', override: true })
if (!process.env.MAC_SYNC_URL) {
  process.env.MAC_SYNC_URL = 'https://wild-coats-care.loca.lt'
}
if (!process.env.MAC_SYNC_SECRET) {
  process.env.MAC_SYNC_SECRET = 'ab-03d76a141177215f900ea39a'
}

async function main() {
  const { archiveTelegramGroupToDrive, resolveAndRunPendingPdfJob } =
    await import('@/lib/telegram/group-archive')
  const { findAcrossStorageMesh } = await import('@/lib/telegram/storage-mesh')

  for (const q of [
    'المعلم الاول',
    'المعلم الأول من معالم من السيرة النبوية',
  ]) {
    const hit = await findAcrossStorageMesh({
      scopeId: 'shared-demo',
      chatId: '-1003855925966',
      queryName: q,
      hydrateBytes: false,
    })
    console.log(
      'MESH',
      q,
      hit
        ? {
            source: hit.source,
            name: hit.fileName,
            vault: hit.vaultFileId,
            tg: hit.telegramFileId,
          }
        : null
    )
  }

  const arch = await archiveTelegramGroupToDrive({
    chatId: '-1003855925966',
    scopeId: 'shared-demo',
    syncMac: false,
    syncRoom: false,
    attachmentLimit: 30,
  })
  console.log(
    'ARCHIVE',
    JSON.stringify(
      {
        seen: arch.attachmentsSeen,
        dl: arch.downloaded,
        drive: arch.pushedToDrive,
        failed: arch.failed.slice(0, 8),
        msg: arch.messageAr,
      },
      null,
      2
    )
  )

  const pdf = await resolveAndRunPendingPdfJob({
    jobId: '96dee180-e828-49db-a2df-0d3a411e90a6',
    chatId: '-1003855925966',
    scopeId: 'shared-demo',
    copyPage: 48,
    afterPage: 45,
    queryNames: [
      'المعلم الاول',
      'المعلم الأول',
      'المعلم الأول من معالم من السيرة النبوية',
      'المعلم الاول.pdf',
      'المعلم الأول.pdf',
    ],
  })
  console.log('PDF', JSON.stringify(pdf, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
