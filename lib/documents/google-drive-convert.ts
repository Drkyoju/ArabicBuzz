/**
 * Free high-fidelity Office/PDF conversion via Google Drive:
 * upload (import → Docs/Sheets/Slides) → export target mime → trash temp.
 * Requires a linked Google account (drive.file + existing OAuth).
 */

import {
  getValidGoogleAccessToken,
  getGoogleTokenRow,
} from '@/lib/google/tokens'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

const GOOGLE_DOC = 'application/vnd.google-apps.document'
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_SLIDE = 'application/vnd.google-apps.presentation'

const MIME_BY_EXT: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pptx:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  html: 'text/html',
}

/** Formats we can import into a Google Workspace type. */
const IMPORT_TO_GOOGLE: Record<string, string> = {
  docx: GOOGLE_DOC,
  doc: GOOGLE_DOC,
  odt: GOOGLE_DOC,
  rtf: GOOGLE_DOC,
  txt: GOOGLE_DOC,
  md: GOOGLE_DOC,
  html: GOOGLE_DOC,
  pdf: GOOGLE_DOC,
  xlsx: GOOGLE_SHEET,
  xls: GOOGLE_SHEET,
  ods: GOOGLE_SHEET,
  csv: GOOGLE_SHEET,
  pptx: GOOGLE_SLIDE,
  ppt: GOOGLE_SLIDE,
  odp: GOOGLE_SLIDE,
}

/** Export mime from a Google Workspace native type. */
const EXPORT_FROM_GOOGLE: Record<
  string,
  Partial<Record<string, string>>
> = {
  [GOOGLE_DOC]: {
    docx: MIME_BY_EXT.docx,
    pdf: MIME_BY_EXT.pdf,
    txt: 'text/plain',
    rtf: MIME_BY_EXT.rtf,
    odt: MIME_BY_EXT.odt,
    html: 'text/html',
  },
  [GOOGLE_SHEET]: {
    xlsx: MIME_BY_EXT.xlsx,
    pdf: MIME_BY_EXT.pdf,
    csv: MIME_BY_EXT.csv,
    ods: MIME_BY_EXT.ods,
  },
  [GOOGLE_SLIDE]: {
    pptx: MIME_BY_EXT.pptx,
    pdf: MIME_BY_EXT.pdf,
    txt: 'text/plain',
    odp: MIME_BY_EXT.odp,
  },
}

export const GOOGLE_DRIVE_CONVERT_FORMATS = [
  'docx',
  'doc',
  'pdf',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'txt',
  'md',
  'csv',
  'rtf',
  'odt',
  'ods',
  'odp',
] as const

export type GoogleDriveConvertFormat =
  (typeof GOOGLE_DRIVE_CONVERT_FORMATS)[number]

export function googleDriveConvertStatusAr(linked: boolean): string {
  return linked
    ? 'مجاني · مفعّل (تحويل Google Drive)'
    : 'الأفضل مجاناً: اربط Google من الإعدادات لتحويل عالي الجودة'
}

/** True when the user has a usable Google token (Drive convert can run). */
export async function googleDriveConvertAvailable(
  userId: string
): Promise<boolean> {
  if (!userId || userId === 'engine' || userId === 'local-owner') return false
  const row = await getGoogleTokenRow(userId)
  return Boolean(row?.access_token || row?.refresh_token)
}

/**
 * Can Drive convert this pair?
 * Same Google family only (Docs↔docx/pdf, Sheets↔xlsx/pdf, Slides↔pptx/pdf…).
 */
export function canConvertViaGoogleDrive(
  fromFormat: string,
  toFormat: string
): boolean {
  const from = fromFormat.toLowerCase()
  const to = toFormat.toLowerCase()
  if (from === to) return false
  const googleMime = IMPORT_TO_GOOGLE[from]
  if (!googleMime) return false
  const exportMime = EXPORT_FROM_GOOGLE[googleMime]?.[to]
  return Boolean(exportMime)
}

function normalizeExt(name: string, fallback?: string): string {
  const ext = (name.split('.').pop() || fallback || '').toLowerCase()
  return ext.replace(/^\./, '')
}

async function trashTempFile(accessToken: string, fileId: string) {
  try {
    await fetch(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      }
    )
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Convert buffer via temporary Google Workspace import + export.
 * Temp file is trashed after export.
 */
export async function convertViaGoogleDrive(opts: {
  userId: string
  buffer: Buffer | Uint8Array
  filename: string
  inputFormat?: string
  outputFormat: string
}): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const tok = await getValidGoogleAccessToken(opts.userId)
  if (!tok.ok) throw new Error(tok.error)

  const inputFormat = normalizeExt(
    opts.filename,
    opts.inputFormat || ''
  )
  const outputFormat = opts.outputFormat.toLowerCase()

  if (!canConvertViaGoogleDrive(inputFormat, outputFormat)) {
    throw new Error(
      `تحويل Google لا يدعم ${inputFormat || '?'} → ${outputFormat}. الصيغ المجانية عبر Drive: PDF↔Word وExcel↔PDF وPowerPoint↔PDF ضمن نفس العائلة. أعد ربط Google من الإعدادات إن لزم.`
    )
  }

  const googleMime = IMPORT_TO_GOOGLE[inputFormat]!
  const exportMime = EXPORT_FROM_GOOGLE[googleMime]![outputFormat]!
  const sourceMime =
    MIME_BY_EXT[inputFormat] || 'application/octet-stream'

  const tempName = `ab-convert-tmp-${Date.now().toString(36)}-${opts.filename.replace(/[^\w.\u0600-\u06FF-]+/g, '_').slice(0, 80)}`
  const metadata = {
    name: tempName,
    mimeType: googleMime,
  }

  const boundary = `ab-${Date.now().toString(36)}`
  const metaPart = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${sourceMime}\r\n` +
      `Content-Transfer-Encoding: binary\r\n\r\n`,
    'utf8'
  )
  const endPart = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([
    metaPart,
    Buffer.from(opts.buffer),
    endPart,
  ])

  const uploadRes = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  const uploaded = (await uploadRes.json()) as {
    id?: string
    mimeType?: string
    error?: { message?: string }
  }
  if (!uploadRes.ok || !uploaded.id) {
    throw new Error(
      uploaded.error?.message ||
        `تعذّر رفع الملف إلى Drive للتحويل (HTTP ${uploadRes.status}). أعد ربط Google بصلاحية Drive.`
    )
  }

  const tempId = uploaded.id
  try {
    // PDF→Docs OCR/import can lag a few seconds before export works.
    const exportUrl = `${DRIVE}/files/${encodeURIComponent(tempId)}/export?mimeType=${encodeURIComponent(exportMime)}`
    let lastErr = ''
    let exportRes: Response | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1200 * attempt))
      }
      // Confirm Google finished converting to Workspace mime (esp. scanned PDF).
      if (inputFormat === 'pdf' || attempt > 0) {
        try {
          const metaRes = await fetch(
            `${DRIVE}/files/${encodeURIComponent(tempId)}?fields=id,mimeType&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${tok.accessToken}` } }
          )
          if (metaRes.ok) {
            const meta = (await metaRes.json()) as { mimeType?: string }
            if (meta.mimeType && meta.mimeType !== googleMime && attempt < 4) {
              continue
            }
          }
        } catch {
          /* ignore meta probe */
        }
      }
      exportRes = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${tok.accessToken}` },
      })
      if (exportRes.ok) break
      lastErr = await exportRes.text().catch(() => '')
      const retryable =
        exportRes.status === 500 ||
        exportRes.status === 403 ||
        exportRes.status === 429 ||
        exportRes.status === 404
      if (!retryable || attempt === 4) {
        throw new Error(
          `تعذّر تصدير الناتج من Google (HTTP ${exportRes.status}) ${lastErr.slice(0, 160)}. إن كان PDF ممسوحاً انتظر لحظات وأعد المحاولة، أو أعد ربط Google بصلاحية Drive.`
        )
      }
    }
    if (!exportRes?.ok) {
      throw new Error(
        `تعذّر تصدير الناتج من Google بعد عدة محاولات. ${lastErr.slice(0, 120)}`
      )
    }
    const ab = await exportRes.arrayBuffer()
    const base =
      opts.filename.replace(/\.[^.]+$/, '') || 'converted'
    const outName = `${base}.${outputFormat}`
    return {
      buffer: Buffer.from(ab),
      filename: outName,
      mimeType:
        exportRes.headers.get('content-type') ||
        MIME_BY_EXT[outputFormat] ||
        'application/octet-stream',
    }
  } finally {
    await trashTempFile(tok.accessToken, tempId)
  }
}
