/**
 * Cross-surface file bridge: Telegram ↔ assistants ↔ team room (client).
 */

import { authHeaders } from '@/lib/supabase/browser'
import type { RoomFileAttachment } from '@/lib/scopes/types'
import {
  formatDownloadMarker,
  type BridgeFilePayload,
} from '@/lib/files/file-markers'

export {
  composerHintForFile,
  formatDownloadMarker,
  parseFileMarkersFromText,
  type BridgeFileKind,
  type BridgeFilePayload,
} from '@/lib/files/file-markers'

export const AB_FILE_DND = 'application/x-arabicbuzz-file'
export const AB_ATTACH_ASSISTANTS = 'ab-attach-assistants'
export const AB_ATTACH_ROOM = 'ab-attach-room'
export const AB_PENDING_ROOM_ATTACH = 'ab-pending-room-attach'

export function toRoomAttachment(p: BridgeFilePayload): RoomFileAttachment {
  return {
    fileId: p.fileId,
    name: p.name,
    mimeType: p.mimeType,
    scopeId: p.scopeId,
    edited: p.edited,
  }
}

export function setBridgeDragData(
  dt: DataTransfer,
  payload: BridgeFilePayload
): void {
  const json = JSON.stringify(payload)
  dt.setData(AB_FILE_DND, json)
  dt.setData('text/plain', formatDownloadMarker(payload))
  dt.effectAllowed = 'copy'
}

export function getBridgeDragData(
  dt: DataTransfer | null
): BridgeFilePayload | null {
  if (!dt) return null
  const raw = dt.getData(AB_FILE_DND)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as BridgeFilePayload
    if (!parsed?.fileId || !parsed?.name || !parsed?.scopeId) return null
    return parsed
  } catch {
    return null
  }
}

export function dispatchAttachAssistants(payload: BridgeFilePayload): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(AB_ATTACH_ASSISTANTS, { detail: payload })
  )
}

export function dispatchAttachRoom(payload: BridgeFilePayload): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(AB_PENDING_ROOM_ATTACH, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(AB_ATTACH_ROOM, { detail: payload }))
}

export function consumePendingRoomAttach(): BridgeFilePayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(AB_PENDING_ROOM_ATTACH)
    if (!raw) return null
    sessionStorage.removeItem(AB_PENDING_ROOM_ATTACH)
    const parsed = JSON.parse(raw) as BridgeFilePayload
    if (!parsed?.fileId) return null
    return parsed
  } catch {
    return null
  }
}

export async function sendWorkspaceFileToTelegram(
  payload: BridgeFilePayload,
  captionAr?: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/rooms/outbound-file', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      scopeId: payload.scopeId,
      fileId: payload.fileId,
      channel: 'telegram',
      captionAr:
        captionAr ||
        (payload.kind === 'voice'
          ? `صوت من Arabic Buzz: ${payload.name}`
          : `ملف من Arabic Buzz: ${payload.name}`),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    return { ok: false, error: data.error || `تعذّر الإرسال (${res.status})` }
  }
  return { ok: true }
}

/** Upload a local File to workspace vault then send to Telegram. */
export async function uploadAndSendFileToTelegram(opts: {
  scopeId: string
  file: File
  captionAr?: string
}): Promise<{ ok: boolean; error?: string; fileId?: string }> {
  const body = new FormData()
  body.append('scopeId', opts.scopeId)
  body.append('file', opts.file)
  const up = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: await authHeaders(),
    body,
  })
  const upData = (await up.json().catch(() => ({}))) as {
    error?: string
    file?: { id?: string; originalName?: string; mimeType?: string }
  }
  if (!up.ok || !upData.file?.id) {
    return {
      ok: false,
      error: upData.error || 'تعذّر رفع الملف قبل الإرسال',
    }
  }
  const sent = await sendWorkspaceFileToTelegram(
    {
      fileId: upData.file.id,
      name: upData.file.originalName || opts.file.name,
      mimeType: upData.file.mimeType || opts.file.type,
      scopeId: opts.scopeId,
      kind: (upData.file.mimeType || opts.file.type || '').startsWith('audio/')
        ? 'voice'
        : 'file',
    },
    opts.captionAr
  )
  return { ...sent, fileId: upData.file.id }
}
