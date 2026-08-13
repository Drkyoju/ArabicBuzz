/**
 * Permanently delete Drive files we previously moved to trash during duplicate cleanup.
 * Safe default: dry-run. Pass --execute to permanently delete.
 *
 * Only targets IDs listed in:
 *   scripts/_cleanup-drive-duplicates-fast.log.json
 *   scripts/_cleanup-drive-duplicates.log.json
 * plus optional --from-trash-under-folder (trashed items that still list brain folder as parent).
 *
 * Usage:
 *   npx tsx scripts/empty-drive-dup-trash.ts
 *   npx tsx scripts/empty-drive-dup-trash.ts --execute
 */
import { config } from 'dotenv'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: '.env.local', override: true })

const DRIVE = 'https://www.googleapis.com/drive/v3'
const BRAIN_FOLDER =
  process.env.GOOGLE_DRIVE_BRAIN_FOLDER_ID?.trim() ||
  '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'
const CONCURRENCY = 15
const EXECUTE = process.argv.includes('--execute')

type LogShape = { trashedIds?: string[]; summary?: Record<string, unknown> }

function loadIdsFromLogs(): string[] {
  const files = [
    'scripts/_cleanup-drive-duplicates-fast.log.json',
    'scripts/_cleanup-drive-duplicates.log.json',
  ]
  const ids = new Set<string>()
  for (const rel of files) {
    const p = resolve(process.cwd(), rel)
    if (!existsSync(p)) continue
    try {
      const j = JSON.parse(readFileSync(p, 'utf8')) as LogShape
      for (const id of j.trashedIds || []) {
        if (id && typeof id === 'string') ids.add(id)
      }
    } catch (e) {
      console.warn('skip log', rel, e instanceof Error ? e.message : e)
    }
  }
  return [...ids]
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function getToken(userId: string): Promise<string> {
  const { getValidGoogleAccessToken } = await import('@/lib/google/tokens')
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  return tok.accessToken
}

async function permanentlyDelete(
  accessToken: string,
  fileId: string,
  attempt = 0
): Promise<{ ok: boolean; error?: string; alreadyGone?: boolean }> {
  const res = await fetch(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  if (res.status === 204 || res.status === 200) return { ok: true }
  if (res.status === 404) return { ok: true, alreadyGone: true }
  if ((res.status === 403 || res.status === 429) && attempt < 5) {
    await sleep(800 * (attempt + 1))
    return permanentlyDelete(accessToken, fileId, attempt + 1)
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
  }
  return { ok: false, error: body.error?.message || `HTTP ${res.status}` }
}

async function isTrashed(
  accessToken: string,
  fileId: string
): Promise<boolean | null> {
  const res = await fetch(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,trashed,name,parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = (await res.json()) as {
    trashed?: boolean
    parents?: string[]
  }
  // Only delete if still in trash (or already gone). Never delete live files.
  return Boolean(data.trashed)
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  return out
}

async function listBrainFolderIds(accessToken: string): Promise<Set<string>> {
  const folders = new Set<string>([BRAIN_FOLDER])
  const queue = [BRAIN_FOLDER]
  const seen = new Set<string>()
  while (queue.length) {
    const parent = queue.shift()!
    if (seen.has(parent)) continue
    seen.add(parent)
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${parent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        pageSize: '1000',
        fields: 'nextPageToken, files(id)',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await fetch(`${DRIVE}/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json()) as {
        files?: Array<{ id: string }>
        nextPageToken?: string
      }
      if (!res.ok) break
      for (const f of data.files || []) {
        folders.add(f.id)
        queue.push(f.id)
      }
      pageToken = data.nextPageToken
    } while (pageToken)
  }
  return folders
}

async function listTrashedUnderBrain(
  accessToken: string,
  brainFolders: Set<string>
): Promise<string[]> {
  const out: string[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: 'trashed = true',
      pageSize: '1000',
      fields: 'nextPageToken, files(id,parents,name)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${DRIVE}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = (await res.json()) as {
      files?: Array<{ id: string; parents?: string[]; name?: string }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `list trash HTTP ${res.status}`)
    }
    for (const f of data.files || []) {
      const parents = f.parents || []
      if (parents.some((p) => brainFolders.has(p))) out.push(f.id)
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

async function main() {
  const logIds = loadIdsFromLogs()
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? 'execute' : 'dry-run',
        brainFolder: BRAIN_FOLDER,
        candidateIdsFromLogs: logIds.length,
        hint: EXECUTE
          ? 'permanently deleting trashed cleanup duplicates + trashed under ملفات الجمعية'
          : 'pass --execute to permanently delete',
      },
      null,
      2
    )
  )

  const { resolveDriveBrainOwnerUserId } = await import(
    '@/lib/channels/owner-context'
  )
  const userId = await resolveDriveBrainOwnerUserId()
  if (!userId) throw new Error('No Drive brain owner user id')
  const token = await getToken(userId)

  const brainFolders = await listBrainFolderIds(token)
  const underBrain = await listTrashedUnderBrain(token, brainFolders)
  const ids = [...new Set([...logIds, ...underBrain])]
  console.log(
    JSON.stringify({
      brainFolders: brainFolders.size,
      trashedUnderBrain: underBrain.length,
      totalCandidates: ids.length,
    })
  )

  if (!ids.length) {
    console.log('No trashed candidates — nothing to do.')
    return
  }

  let deleted = 0
  let skippedLive = 0
  let alreadyGone = 0
  let failed = 0

  await mapPool(ids, CONCURRENCY, async (id) => {
    const trashed = await isTrashed(token, id)
    if (trashed === null) {
      alreadyGone++
      return
    }
    if (trashed === false) {
      skippedLive++
      console.warn('skip_live_not_trashed', id)
      return
    }
    if (!EXECUTE) {
      deleted++
      return
    }
    const r = await permanentlyDelete(token, id)
    if (r.ok) {
      if (r.alreadyGone) alreadyGone++
      else deleted++
    } else {
      failed++
      console.warn('delete_failed', id, r.error)
    }
  })

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        mode: EXECUTE ? 'execute' : 'dry-run',
        wouldOrDidDelete: deleted,
        alreadyGone,
        skippedLive,
        failed,
        noteAr: EXECUTE
          ? 'حُذف نهائياً ما كان في سلة المهملات من تنظيف التكرار أو تحت مجلد الجمعية.'
          : 'معاينة — أعد مع --execute للحذف النهائي.',
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
