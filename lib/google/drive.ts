import { getValidGoogleAccessToken } from '@/lib/google/tokens'

const DRIVE = 'https://www.googleapis.com/drive/v3'

/** Default shared association folder (ملفات الجمعية). Override with env. */
export const DEFAULT_DRIVE_BRAIN_FOLDER_ID =
  '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW'

/** Canonical scope for company-brain Drive index (RAG works from any room). */
export const COMPANY_BRAIN_SCOPE_ID =
  process.env.COMPANY_BRAIN_SCOPE_ID?.trim() || 'shared-demo'

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

export function classifyDriveAccessError(err: unknown): {
  code: 'no_token' | 'permission' | 'not_found' | 'other'
  messageAr: string
} {
  const raw = err instanceof Error ? err.message : String(err || '')
  const lower = raw.toLowerCase()
  if (/غير مربوط|انتهت صلاحية|تعذّر تجديد|google غير|تقويم google غير/i.test(raw)) {
    return {
      code: 'no_token',
      messageAr:
        'Google غير مربوط أو انتهت صلاحية الرمز. من الإعدادات اضغط «ربط Google (Drive)» بحساب ryodan71@gmail.com ثم أعد المحاولة.',
    }
  }
  if (
    /403|401|insufficient|permission|accessDenied|forbidden|ليس لديك صلاحية/i.test(lower) ||
    /صلاحية|أعد ربط google بصلاحية drive/i.test(raw)
  ) {
    return {
      code: 'permission',
      messageAr:
        'الحساب المربوط لا يملك صلاحية قراءة مجلد «ملفات الجمعية». افتح رابط المجلد وشاركه مع البريد المربوط (عرض على الأقل)، أو أعد الربط بحساب يملك المجلد.',
    }
  }
  if (/404|notFound|file not found/i.test(lower)) {
    return {
      code: 'not_found',
      messageAr:
        'معرّف مجلد عقل الشركة غير صحيح أو حُذف. تحقق من GOOGLE_DRIVE_BRAIN_FOLDER_ID على الاستضافة.',
    }
  }
  return { code: 'other', messageAr: raw || 'فشل الوصول إلى Google Drive' }
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
 * Download / export file bytes.
 * Google Docs → DOCX; Sheets → XLSX; Slides → PPTX (Office edit loop).
 * Pass `asText: true` for plain text / CSV (RAG / quick preview).
 */
export async function downloadDriveFile(
  userId: string,
  file: DriveFileMeta,
  opts?: { asText?: boolean }
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)

  const googleNative = file.mimeType.startsWith('application/vnd.google-apps.')
  let url: string
  let filename = file.name
  let mimeType = file.mimeType

  if (googleNative) {
    let exportMime = 'application/pdf'
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      if (opts?.asText) {
        exportMime = 'text/csv'
        if (!filename.endsWith('.csv')) filename = `${filename}.csv`
      } else {
        exportMime =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        if (!/\.xlsx$/i.test(filename)) filename = `${filename}.xlsx`
      }
    } else if (file.mimeType === 'application/vnd.google-apps.document') {
      if (opts?.asText) {
        exportMime = 'text/plain'
        if (!filename.endsWith('.txt')) filename = `${filename}.txt`
      } else {
        exportMime =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        if (!/\.docx$/i.test(filename)) filename = `${filename}.docx`
      }
    } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
      if (opts?.asText) {
        exportMime = 'text/plain'
        if (!filename.endsWith('.txt')) filename = `${filename}.txt`
      } else {
        exportMime =
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        if (!/\.pptx$/i.test(filename)) filename = `${filename}.pptx`
      }
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
  return uploadDriveBinaryFile(userId, {
    name: opts.name,
    buffer: Buffer.from(opts.content, 'utf8'),
    mimeType: opts.mimeType || 'text/plain',
    folderId: opts.folderId,
  })
}

/** Upload binary (docx/pdf/xlsx…) into the brain Drive folder. */
export async function uploadDriveBinaryFile(
  userId: string,
  opts: {
    name: string
    buffer: Buffer
    mimeType: string
    folderId?: string
  }
): Promise<DriveFileMeta> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const folderId = opts.folderId || getDriveBrainFolderId()
  const mimeType = opts.mimeType || 'application/octet-stream'
  const metadata = {
    name: opts.name,
    parents: [folderId],
    mimeType,
  }
  const boundary = `ab-${Date.now().toString(36)}`
  const metaPart = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: binary\r\n\r\n`,
    'utf8'
  )
  const endPart = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([metaPart, opts.buffer, endPart])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,modifiedTime',
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

/** Replace contents of an existing Drive file (keeps same file id). */
export async function updateDriveFileMedia(
  userId: string,
  opts: {
    fileId: string
    buffer: Buffer
    mimeType: string
    name?: string
  }
): Promise<DriveFileMeta> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)

  if (opts.name) {
    await fetch(
      `${DRIVE}/files/${encodeURIComponent(opts.fileId)}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tok.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: opts.name }),
      }
    )
  }

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(opts.fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': opts.mimeType || 'application/octet-stream',
      },
      body: new Uint8Array(opts.buffer),
    }
  )
  const data = (await res.json()) as DriveFileMeta & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || `فشل تحديث Drive (HTTP ${res.status})`
    )
  }
  return data
}

/** Move a Drive file to trash (soft delete). */
export async function trashDriveFile(
  userId: string,
  fileId: string
): Promise<{ ok: true; id: string }> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const res = await fetch(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    }
  )
  const data = (await res.json()) as {
    id?: string
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || `فشل نقل الملف لسلة المهملات (HTTP ${res.status})`
    )
  }
  return { ok: true, id: data.id || fileId }
}

/** Resolve a Drive file by id or fuzzy name inside the brain folder. */
export async function findDriveBrainFile(
  userId: string,
  ref: string
): Promise<DriveFileMeta | null> {
  const q = ref.trim()
  if (!q) return null
  if (/^[a-zA-Z0-9_-]{10,}$/.test(q) && !q.includes(' ') && !q.includes('.')) {
    const tok = await getValidGoogleAccessToken(userId)
    if (!tok.ok) throw new Error(tok.error)
    const res = await fetch(
      `${DRIVE}/files/${encodeURIComponent(q)}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size,webViewLink`,
      { headers: { Authorization: `Bearer ${tok.accessToken}` } }
    )
    if (res.ok) {
      return (await res.json()) as DriveFileMeta
    }
  }
  const files = await listDriveFolderFiles(userId, { recursive: true })
  const lower = q.toLowerCase()
  const exact = files.find((f) => f.name.toLowerCase() === lower)
  if (exact) return exact
  const partial = files.find(
    (f) =>
      f.name.toLowerCase().includes(lower) ||
      lower.includes(f.name.toLowerCase().replace(/\.[^.]+$/, ''))
  )
  return partial || null
}

