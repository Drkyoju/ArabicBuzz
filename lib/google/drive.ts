import { getValidGoogleAccessToken } from '@/lib/google/tokens'

const DRIVE = 'https://www.googleapis.com/drive/v3'

/** Default shared association folder (ملفات الجمعية). Override with env. */
export const DEFAULT_DRIVE_BRAIN_FOLDER_ID =
  '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'

export type DriveFileMeta = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  webViewLink?: string
}

export function getDriveBrainFolderId() {
  return (
    process.env.GOOGLE_DRIVE_BRAIN_FOLDER_ID?.trim() ||
    DEFAULT_DRIVE_BRAIN_FOLDER_ID
  )
}

async function driveFetch(userId: string, pathAndQuery: string) {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const res = await fetch(`${DRIVE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  })
  return res
}

/** List files in the company-brain Drive folder (recursive by default). */
export async function listDriveFolderFiles(
  userId: string,
  opts?: { folderId?: string; pageSize?: number; recursive?: boolean }
): Promise<DriveFileMeta[]> {
  const folderId = opts?.folderId || getDriveBrainFolderId()
  const recursive = opts?.recursive !== false
  const out: DriveFileMeta[] = []
  const queue = [folderId]
  const seenFolders = new Set<string>()

  while (queue.length > 0) {
    const parent = queue.shift()!
    if (seenFolders.has(parent)) continue
    seenFolders.add(parent)

    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${parent}' in parents and trashed = false`,
        pageSize: String(opts?.pageSize || 100),
        fields:
          'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)

      const res = await driveFetch(userId, `/files?${params.toString()}`)
      const data = (await res.json()) as {
        files?: DriveFileMeta[]
        nextPageToken?: string
        error?: { message?: string }
      }
      if (!res.ok) {
        throw new Error(
          data.error?.message ||
            `Drive list HTTP ${res.status} — أعد ربط Google بصلاحية Drive`
        )
      }
      for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (recursive) queue.push(f.id)
        } else {
          out.push(f)
        }
      }
      pageToken = data.nextPageToken
    } while (pageToken)
  }

  return out
}

/**
 * Download / export file bytes for text extraction.
 * Google Docs → plain text; Sheets → CSV; others → media / PDF export.
 */
export async function downloadDriveFile(
  userId: string,
  file: DriveFileMeta
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)

  const googleNative = file.mimeType.startsWith('application/vnd.google-apps.')
  let url: string
  let filename = file.name
  let mimeType = file.mimeType

  if (googleNative) {
    let exportMime = 'text/plain'
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      exportMime = 'text/csv'
      if (!filename.endsWith('.csv')) filename = `${filename}.csv`
    } else if (
      file.mimeType === 'application/vnd.google-apps.presentation' ||
      file.mimeType === 'application/vnd.google-apps.document'
    ) {
      exportMime = 'text/plain'
      if (!filename.endsWith('.txt')) filename = `${filename}.txt`
    } else {
      exportMime = 'application/pdf'
      if (!filename.endsWith('.pdf')) filename = `${filename}.pdf`
    }
    mimeType = exportMime
    url = `${DRIVE}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(exportMime)}`
  } else {
    url = `${DRIVE}/files/${encodeURIComponent(file.id)}?alt=media`
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(
      `تعذّر تنزيل «${file.name}» من Drive (HTTP ${res.status}) ${err.slice(0, 120)}`
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return { buffer: buf, filename, mimeType }
}

/** Upload a plain-text / markdown file into the brain folder (or parent). */
export async function uploadDriveTextFile(
  userId: string,
  opts: {
    name: string
    content: string
    mimeType?: string
    folderId?: string
  }
): Promise<DriveFileMeta> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const folderId = opts.folderId || getDriveBrainFolderId()
  const mimeType = opts.mimeType || 'text/plain'
  const metadata = {
    name: opts.name,
    parents: [folderId],
    mimeType,
  }
  const boundary = `ab-${Date.now().toString(36)}`
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${opts.content}\r\n` +
    `--${boundary}--`

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  const data = (await res.json()) as DriveFileMeta & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || `فشل رفع Drive (HTTP ${res.status})`
    )
  }
  return data
}

