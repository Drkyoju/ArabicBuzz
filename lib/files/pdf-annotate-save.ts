'use client'

/**
 * Client helpers to replace / upload PDF blobs via existing storage APIs.
 */
import { authHeaders } from '@/lib/supabase/browser'

export type SavedWorkspaceFile = {
  id: string
  originalName: string
  mimeType?: string
  size?: number
}

type DirectUpload = {
  replaceUrl?: string
  uploadUrl?: string
  secretHeader?: string | null
  secretValue?: string | null
}

async function putDirect(
  url: string,
  file: File,
  scopeId: string,
  direct: DirectUpload,
  mode: 'replace' | 'upload'
) {
  const headers: Record<string, string> = {
    'X-Scope-Id': scopeId,
    'X-Original-Name': encodeURIComponent(file.name),
    'X-Mime-Type': file.type || 'application/pdf',
    'Content-Type': file.type || 'application/pdf',
  }
  if (direct.secretHeader && direct.secretValue) {
    headers[direct.secretHeader] = direct.secretValue
  }
  const res = await fetch(url, { method: 'PUT', headers, body: file })
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: SavedWorkspaceFile
  }
  if (!res.ok || data.ok === false) {
    throw new Error(
      data.error ||
        data.messageAr ||
        (mode === 'replace' ? 'فشل الاستبدال المباشر' : 'فشل الرفع المباشر')
    )
  }
  return data
}

/** Replace file bytes in place (same id). */
export async function replaceWorkspacePdf(opts: {
  scopeId: string
  fileId: string
  bytes: Uint8Array
  fileName: string
}): Promise<{ messageAr?: string; file?: SavedWorkspaceFile }> {
  const file = new File([new Uint8Array(opts.bytes)], opts.fileName, {
    type: 'application/pdf',
  })
  const body = new FormData()
  body.append('scopeId', opts.scopeId)
  body.append('id', opts.fileId)
  body.append('file', file)
  const res = await fetch('/api/storage/file', {
    method: 'PUT',
    headers: await authHeaders(),
    body,
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: SavedWorkspaceFile
    directUploadRequired?: boolean
    directUpload?: DirectUpload
  }
  if (data.directUploadRequired && data.directUpload?.replaceUrl) {
    const put = await putDirect(
      data.directUpload.replaceUrl,
      file,
      opts.scopeId,
      data.directUpload,
      'replace'
    )
    return { messageAr: put.messageAr, file: put.file }
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.messageAr || 'فشل حفظ الملف')
  }
  return { messageAr: data.messageAr, file: data.file }
}

/** Upload as a new vault file (clean copy or annotated copy). */
export async function uploadWorkspacePdf(opts: {
  scopeId: string
  bytes: Uint8Array
  fileName: string
}): Promise<{ messageAr?: string; file: SavedWorkspaceFile }> {
  const file = new File([new Uint8Array(opts.bytes)], opts.fileName, {
    type: 'application/pdf',
  })
  const body = new FormData()
  body.append('scopeId', opts.scopeId)
  body.append('file', file)
  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: await authHeaders(),
    body,
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: SavedWorkspaceFile
    directUploadRequired?: boolean
    directUpload?: DirectUpload
  }
  if (data.directUploadRequired && data.directUpload?.uploadUrl) {
    const put = await putDirect(
      data.directUpload.uploadUrl,
      file,
      opts.scopeId,
      data.directUpload,
      'upload'
    )
    if (!put.file?.id) {
      throw new Error(put.messageAr || 'رُفع الملف لكن المعرّف مفقود')
    }
    return { messageAr: put.messageAr, file: put.file }
  }
  if (!res.ok || data.ok === false || !data.file?.id) {
    throw new Error(data.error || data.messageAr || 'فشل رفع النسخة')
  }
  return { messageAr: data.messageAr, file: data.file }
}

let arabicFontCache: Uint8Array | null = null

export async function loadClientArabicFont(): Promise<Uint8Array | null> {
  if (arabicFontCache) return arabicFontCache
  const urls = [
    '/fonts/NotoNaskhArabic-Regular.ttf',
    '/api/fonts/arabic',
    'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf',
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength > 1000) {
        arabicFontCache = buf
        return buf
      }
    } catch {
      /* try next */
    }
  }
  return null
}

/** Suggest a versioned name for annotated / clean copies. */
export function suggestAnnotatedCopyName(
  sourceName: string,
  kind: 'annotated' | 'clean'
): string {
  const base = sourceName.replace(/\.pdf$/i, '') || 'document'
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', '-')
    .replace(':', '')
  const tag = kind === 'annotated' ? 'معلّق' : 'بدون-تعليق'
  return `${base}-${tag}-${stamp}.pdf`
}
