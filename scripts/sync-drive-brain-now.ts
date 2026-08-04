/**
 * One-shot: refresh linked Google OAuth + sync ملفات الجمعية → cloud brain.
 * Pulls GOOGLE_CLIENT_* from Netlify env (not committed).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function loadNetlifyGoogleCreds() {
  const site = process.env.NETLIFY_SITE_ID
  const tok = process.env.NETLIFY_AUTH_TOKEN
  if (!site || !tok) throw new Error('NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN required')
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${site}/env`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
  if (!res.ok) throw new Error(`Netlify env HTTP ${res.status}`)
  const list = (await res.json()) as Array<{
    key: string
    values?: Array<{ value?: string; context?: string }>
  }>
  const get = (key: string) => {
    const row = list.find((e) => e.key === key)
    const v =
      row?.values?.find((x) => x.context === 'all' || !x.context)?.value ||
      row?.values?.[0]?.value
    if (!v) throw new Error(`env ${key} missing on Netlify`)
    return v
  }
  process.env.GOOGLE_CLIENT_ID = get('GOOGLE_CLIENT_ID')
  process.env.GOOGLE_CLIENT_SECRET = get('GOOGLE_CLIENT_SECRET')
  const folder = list.find((e) => e.key === 'GOOGLE_DRIVE_BRAIN_FOLDER_ID')
    ?.values?.[0]?.value
  if (folder) process.env.GOOGLE_DRIVE_BRAIN_FOLDER_ID = folder
}

async function main() {
  await loadNetlifyGoogleCreds()
  process.env.GOOGLE_DRIVE_BRAIN_FOLDER_ID =
    process.env.GOOGLE_DRIVE_BRAIN_FOLDER_ID ||
    '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'
  process.env.BRAIN_PRIMARY = ''

  const USER_ID = 'bc4522fe-30a5-4e7a-9a85-5ac969d7b9ca'
  const FOLDER = '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'

  const { getValidGoogleAccessToken } = await import('../lib/google/tokens')
  const { syncDriveFolderToBrain } = await import('../lib/google/drive-brain')

  const access = await getValidGoogleAccessToken(USER_ID)
  if (!access.ok) {
    console.error('TOKEN_FAIL', access.error)
    process.exit(1)
  }
  console.log('Google OK for', access.email)

  let round = 0
  while (round < 20) {
    round += 1
    const result = await syncDriveFolderToBrain({
      userId: USER_ID,
      scopeId: 'shared-demo',
      folderId: FOLDER,
      maxFiles: 4,
    })
    console.log(
      JSON.stringify({
        round,
        ingested: result.ingested,
        skipped: result.skipped,
        alreadyIndexed: result.alreadyIndexed,
        hasMore: result.hasMore,
        remaining: result.remaining,
        scanned: result.scanned,
        errors: result.errors.slice(0, 8),
        files: result.files.map((f) => f.name),
      })
    )
    if (!result.hasMore) break
  }

  const { PrismaClient } = await import('@prisma/client')
  const p = new PrismaClient()
  const counts = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE source_file_id LIKE 'gdrive:%')::int AS drive_n,
            count(DISTINCT source_file_id) FILTER (WHERE source_file_id LIKE 'gdrive:%')::int AS drive_files
     FROM knowledge_documents`
  )
  console.log('DB', counts)
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
