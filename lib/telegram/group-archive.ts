/**
 * Archive Telegram group media (files + voice) → room + Google Drive (primary).
 *
 * Bot API cannot fetch ancient chat history the bot never received.
 * This backfills ALL recoverable sources:
 *  - MTProto user scan via Mac hop (when TELEGRAM_SESSION_STRING present)
 *  - telegram_attachments rows (re-download live file_id when possible)
 *  - room vault files (push missing ones to Drive)
 *  - Mac sync vault (pull + Drive)
 * Ongoing: afterTelegramMediaSaved + persistBytesToRoomAndDrive on receive.
 */
import { listPersistedTelegramAttachments } from '@/lib/telegram/attachment-persist'
import {
  persistBytesToRoomAndDrive,
  pushVaultToDriveBestEffort,
} from '@/lib/telegram/storage-mesh'
import { isBiologyTeacherGuideName } from '@/lib/files/muallim-seerah-match'
import {
  getDeepHistoryStatus,
  scanTelegramGroupDeepHistory,
} from '@/lib/telegram/history-scan'

export type ArchiveGroupResult = {
  chatId: string
  scopeId: string
  attachmentsSeen: number
  downloaded: number
  pushedToDrive: number
  roomSynced: number
  macSynced: number
  deepHistory?: Awaited<ReturnType<typeof scanTelegramGroupDeepHistory>>
  deepHistoryStatus: ReturnType<typeof getDeepHistoryStatus>
  failed: Array<{ name: string; error: string }>
  limitationAr: string
  messageAr: string
}

const DEFAULT_CHAT = '-1003855925966'
const DEFAULT_SCOPE = 'shared-demo'

async function tryDownloadTg(
  fileId: string,
  fileName?: string,
  sizeBytes?: number
): Promise<Buffer | null> {
  try {
    const { downloadTelegramFileCascaded } = await import(
      '@/lib/telegram/large-file-download'
    )
    const r = await downloadTelegramFileCascaded({
      fileId,
      fileName,
      declaredSizeBytes: sizeBytes,
    })
    return r.buffer?.length ? r.buffer : null
  } catch {
    return null
  }
}

/**
 * Backfill recoverable TG media + room/Mac into Drive company brain.
 */
export async function archiveTelegramGroupToDrive(opts?: {
  chatId?: string
  scopeId?: string
  /** Max attachment rows to process */
  attachmentLimit?: number
  /** Also sync room vault PDFs/docs/audio to Drive */
  syncRoom?: boolean
  /** Also pull from Mac bridge */
  syncMac?: boolean
}): Promise<ArchiveGroupResult> {
  const chatId = opts?.chatId?.trim() || DEFAULT_CHAT
  const scopeId =
    opts?.scopeId?.trim() ||
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() ||
    DEFAULT_SCOPE
  const failed: ArchiveGroupResult['failed'] = []
  let downloaded = 0
  let pushedToDrive = 0
  let roomSynced = 0
  let macSynced = 0
  const deepHistoryStatus = getDeepHistoryStatus()

  let deepHistory: Awaited<ReturnType<typeof scanTelegramGroupDeepHistory>> | undefined
  try {
    deepHistory = await scanTelegramGroupDeepHistory({
      chatId,
      scopeId,
      muallimOnly: true,
      limit: 250,
    })
    if (deepHistory.downloaded) downloaded += deepHistory.downloaded
    if (deepHistory.ingested) {
      roomSynced += deepHistory.ingested
      pushedToDrive += deepHistory.ingested
    }
    if (!deepHistory.ok && deepHistory.errorAr) {
      failed.push({
        name: 'deep-history',
        error: deepHistory.errorAr.slice(0, 240),
      })
    }
  } catch (e) {
    failed.push({
      name: 'deep-history',
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const atts = await listPersistedTelegramAttachments(
    chatId,
    opts?.attachmentLimit ?? 500
  )

  for (const a of atts) {
    if (isBiologyTeacherGuideName(a.fileName)) continue
    try {
      if (a.hasBytes && a.vaultFileId) {
        const r = await pushVaultToDriveBestEffort({
          scopeId: a.scopeId || scopeId,
          vaultFileId: a.vaultFileId,
          fileName: a.fileName,
        })
        if (r.ok) pushedToDrive++
        else if (r.errorAr) failed.push({ name: a.fileName, error: r.errorAr })
        continue
      }
      if (a.telegramFileId) {
        const buf = await tryDownloadTg(
          a.telegramFileId,
          a.fileName,
          a.sizeBytes
        )
        if (!buf) {
          failed.push({
            name: a.fileName,
            error: 'تعذّر تنزيل file_id (منتهي أو أكبر من المسارات المجانية)',
          })
          continue
        }
        downloaded++
        const saved = await persistBytesToRoomAndDrive({
          scopeId: a.scopeId || scopeId,
          chatId,
          buffer: buf,
          fileName: a.fileName,
          mimeType: a.mimeType,
          telegramFileId: a.telegramFileId,
        })
        if (saved.driveOk) pushedToDrive++
      }
    } catch (e) {
      failed.push({
        name: a.fileName,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (opts?.syncRoom !== false) {
    try {
      const { listWorkspaceFiles } = await import('@/lib/documents/workspace')
      const files = await listWorkspaceFiles(scopeId)
      for (const f of files) {
        if (isBiologyTeacherGuideName(f.originalName)) continue
        const looksMedia =
          /\.(pdf|docx?|xlsx?|pptx?|ogg|mp3|m4a|wav|opus|jpg|jpeg|png|webp)$/i.test(
            f.originalName
          ) ||
          (f.mimeType || '').startsWith('audio/') ||
          (f.mimeType || '').startsWith('image/') ||
          (f.mimeType || '').includes('pdf')
        if (!looksMedia) continue
        // Skip tiny stress fixtures unless TG-named
        if (/^STRESS_/i.test(f.originalName)) continue
        const r = await pushVaultToDriveBestEffort({
          scopeId,
          vaultFileId: f.id,
          fileName: f.originalName,
        })
        if (r.ok) {
          roomSynced++
          pushedToDrive++
        }
      }
    } catch (e) {
      failed.push({
        name: 'room-sync',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (opts?.syncMac !== false) {
    try {
      const { macSyncConfigured, getMacSyncConfig, macReadFile } = await import(
        '@/lib/storage/mac-sync-client'
      )
      if (macSyncConfigured()) {
        const { baseUrl, secret } = getMacSyncConfig()
        const headers: HeadersInit = {}
        if (secret) headers.Authorization = `Bearer ${secret}`
        const res = await fetch(
          `${baseUrl}/files?scopeId=${encodeURIComponent(scopeId)}`,
          { headers, signal: AbortSignal.timeout(15_000) }
        )
        if (res.ok) {
          const data = (await res.json()) as {
            files?: Array<{ id: string; originalName: string; mimeType?: string }>
          }
          for (const f of data.files || []) {
            if (isBiologyTeacherGuideName(f.originalName)) continue
            if (/^STRESS_/i.test(f.originalName)) continue
            try {
              const file = await macReadFile(scopeId, f.id)
              if (!file.buffer?.length) continue
              const saved = await persistBytesToRoomAndDrive({
                scopeId,
                chatId,
                buffer: Buffer.from(file.buffer),
                fileName: f.originalName,
                mimeType: file.meta.mimeType || f.mimeType,
              })
              macSynced++
              if (saved.driveOk) pushedToDrive++
            } catch (e) {
              failed.push({
                name: f.originalName,
                error: e instanceof Error ? e.message : String(e),
              })
            }
          }
        }
      }
    } catch (e) {
      failed.push({
        name: 'mac-sync',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const limitationAr = [
    deepHistoryStatus.limitationAr,
    'الأرشفة تغطي: مسح MTProto (إن وُجدت الجلسة) + المرفقات المسجّلة + file_id الحي + خزنة الغرفة + جسر الماك → Drive.',
    'كل ملف/صوت جديد من المجموعة يُحفظ فوراً في الغرفة وDrive.',
    deepHistory?.credentialsReady === false
      ? deepHistoryStatus.setupAr
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    chatId,
    scopeId,
    attachmentsSeen: atts.length,
    downloaded,
    pushedToDrive,
    roomSynced,
    macSynced,
    deepHistory,
    deepHistoryStatus,
    failed: failed.slice(0, 40),
    limitationAr,
    messageAr: [
      `أرشفة مجموعة تيليجرام → Drive: مرفقات=${atts.length}، تنزيل=${downloaded}، رفع Drive=${pushedToDrive}، غرفة=${roomSynced}، ماك=${macSynced}.`,
      deepHistory?.muallimFound
        ? `وُجد «${deepHistory.muallimFileName}» عبر المسح العميق.`
        : '',
      failed.length ? `إخفاقات: ${failed.length}` : 'بدون إخفاقات مسجّلة.',
    ]
      .filter(Boolean)
      .join(' '),
  }
}

/**
 * Resolve a pending file job via mesh search + execute duplicate if params set.
 * Never asks the user to resend.
 */
export async function resolveAndRunPendingPdfJob(opts: {
  jobId: string
  queryNames: string[]
  chatId: string
  scopeId: string
  copyPage: number
  afterPage: number
}): Promise<{
  ok: boolean
  source?: string
  resultName?: string
  pages?: string
  errorAr?: string
}> {
  const { findAcrossStorageMesh } = await import('@/lib/telegram/storage-mesh')
  let hit = null as Awaited<ReturnType<typeof findAcrossStorageMesh>>
  for (const q of opts.queryNames) {
    hit = await findAcrossStorageMesh({
      scopeId: opts.scopeId,
      chatId: opts.chatId,
      queryName: q,
      hydrateBytes: true,
    })
    if (hit?.buffer?.length) break
  }
  if (!hit?.buffer?.length) {
    return {
      ok: false,
      errorAr:
        'الملف غير موجود في مرآة تيليجرام ولا الغرفة ولا Drive ولا الماك بعد — المهمة تبقى معلّقة صامتة بلا طلب إعادة إرسال.',
    }
  }

  const { duplicatePdfPageAfter } = await import('@/lib/documents/pdf')
  const { saveWorkspaceFile } = await import('@/lib/documents/workspace')
  const out = await duplicatePdfPageAfter({
    pdf: hit.buffer,
    copyPage: opts.copyPage,
    afterPage: opts.afterPage,
  })
  const outName =
    (hit.fileName || 'المعلم-الاول').replace(/\.pdf$/i, '') +
    '_نسخ_صفحة48_بعد_45.pdf'
  const saved = await saveWorkspaceFile({
    scopeId: opts.scopeId,
    buffer: out.buffer,
    originalName: outName,
    mimeType: 'application/pdf',
    markEdited: true,
  })
  void pushVaultToDriveBestEffort({
    scopeId: opts.scopeId,
    vaultFileId: saved.file.id,
    fileName: outName,
  })

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { ok: false, errorAr: 'TELEGRAM_BOT_TOKEN missing' }
  }
  const form = new FormData()
  form.append('chat_id', opts.chatId)
  form.append(
    'caption',
    `تم: نسخت الصفحة ${opts.copyPage} بالكامل وأدرجتها بعد الصفحة ${opts.afterPage} في «${hit.fileName}». الصفحات: ${out.pageCountBefore} → ${out.pageCountAfter}. (مصدر: ${hit.source})`
  )
  form.append(
    'document',
    new Blob([new Uint8Array(out.buffer)], { type: 'application/pdf' }),
    outName
  )
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    { method: 'POST', body: form }
  )
  if (!res.ok) {
    const t = await res.text()
    return { ok: false, errorAr: `sendDocument ${res.status}: ${t.slice(0, 200)}` }
  }

  const { updateTelegramFileJob } = await import('@/lib/telegram/file-jobs')
  await updateTelegramFileJob(opts.jobId, {
    status: 'done',
    vaultFileId: saved.file.id,
    resultVaultFileId: saved.file.id,
    resultName: outName,
    expectedFilename: hit.fileName,
    workParams: { copyPage: opts.copyPage, afterPage: opts.afterPage },
  })

  return {
    ok: true,
    source: hit.source,
    resultName: outName,
    pages: `${out.pageCountBefore}→${out.pageCountAfter}`,
  }
}
