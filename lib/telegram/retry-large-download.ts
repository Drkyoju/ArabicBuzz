/**
 * Retry Telegram download for metadata-only attachments / waiting_file jobs.
 * Persists vault bytes and returns vault file id when cascade succeeds.
 */

import { saveWorkspaceFile } from '@/lib/documents/workspace'
import {
  listPersistedTelegramAttachments,
  persistTelegramAttachment,
  type PersistedTelegramAttachment,
} from '@/lib/telegram/attachment-persist'
import { downloadTelegramFileCascaded } from '@/lib/telegram/large-file-download'
import { updateTelegramFileJob, filenamesStrictMatch } from '@/lib/telegram/file-jobs'

export async function retryTelegramAttachmentDownload(opts: {
  attachment: PersistedTelegramAttachment
}): Promise<{ vaultFileId: string; fileName: string } | null> {
  const a = opts.attachment
  if (a.hasBytes && a.vaultFileId) {
    return { vaultFileId: a.vaultFileId, fileName: a.fileName }
  }
  if (!a.telegramFileId) return null

  try {
    const hit = await downloadTelegramFileCascaded({
      fileId: a.telegramFileId,
      fileName: a.fileName,
      declaredSizeBytes: a.sizeBytes,
      chatId: a.chatId,
      messageId: a.messageId,
    })
    const saved = await saveWorkspaceFile({
      scopeId: a.scopeId,
      buffer: hit.buffer,
      originalName: a.fileName || 'telegram-file.bin',
      mimeType: a.mimeType || 'application/octet-stream',
    })
    await persistTelegramAttachment({
      chatId: a.chatId,
      scopeId: a.scopeId,
      telegramFileId: a.telegramFileId,
      fileUniqueId: a.fileUniqueId,
      messageId: a.messageId,
      fileName: saved.file.originalName,
      mimeType: saved.file.mimeType,
      sizeBytes: hit.buffer.byteLength,
      vaultFileId: saved.file.id,
      hasBytes: true,
    })
    return {
      vaultFileId: saved.file.id,
      fileName: saved.file.originalName,
    }
  } catch (e) {
    console.warn(
      '[telegram] retry download failed',
      a.fileName,
      e instanceof Error ? e.message : e
    )
    return null
  }
}

/**
 * For an open waiting_file job: re-try cascade download then bind vault.
 */
export async function tryFillWaitingJobFromTelegramCascade(opts: {
  jobId: string
  chatId: string
  scopeId: string
  expectedFilename?: string
  telegramFileId?: string
  messageId?: string
}): Promise<{ vaultFileId: string; fileName: string } | null> {
  const list = await listPersistedTelegramAttachments(opts.chatId, 24)

  // If the open job still lacks telegram_file_id, bind the latest matching mirror row.
  if (!opts.telegramFileId) {
    try {
      const { bindOpenJobsToIncomingTelegramFile, filenamesStrictMatch } =
        await import('@/lib/telegram/file-jobs')
      const { matchMuallimSeerahFile } = await import(
        '@/lib/files/muallim-seerah-match'
      )
      for (const a of list) {
        if (/أحياء|احياء|biology/i.test(a.fileName)) continue
        const nameOk =
          !opts.expectedFilename ||
          filenamesStrictMatch(a.fileName, opts.expectedFilename) ||
          (matchMuallimSeerahFile(a.fileName) &&
            matchMuallimSeerahFile(opts.expectedFilename || 'المعلم الاول'))
        if (!nameOk || !a.telegramFileId) continue
        await bindOpenJobsToIncomingTelegramFile({
          chatId: opts.chatId,
          scopeId: opts.scopeId,
          fileName: a.fileName,
          telegramFileId: a.telegramFileId,
          attachmentId: a.id,
          vaultFileId: a.vaultFileId,
          sizeBytes: a.sizeBytes,
        })
        opts = {
          ...opts,
          telegramFileId: a.telegramFileId,
          expectedFilename: opts.expectedFilename || a.fileName,
        }
        break
      }
    } catch (e) {
      console.warn('[telegram] bind file_id onto waiting job', e)
    }
  }

  const candidates = list.filter((a) => {
    if (a.hasBytes && a.vaultFileId) {
      if (
        !opts.expectedFilename ||
        filenamesStrictMatch(a.fileName, opts.expectedFilename)
      ) {
        return true
      }
    }
    if (!a.telegramFileId) return false
    if (
      opts.telegramFileId &&
      a.telegramFileId === opts.telegramFileId
    ) {
      return true
    }
    if (
      opts.expectedFilename &&
      filenamesStrictMatch(a.fileName, opts.expectedFilename)
    ) {
      return true
    }
    return false
  })

  for (const a of candidates) {
    if (a.hasBytes && a.vaultFileId) {
      await updateTelegramFileJob(opts.jobId, {
        status: 'pending',
        vaultFileId: a.vaultFileId,
        expectedFilename: opts.expectedFilename || a.fileName,
      })
      return { vaultFileId: a.vaultFileId, fileName: a.fileName }
    }
    const got = await retryTelegramAttachmentDownload({ attachment: a })
    if (got) {
      await updateTelegramFileJob(opts.jobId, {
        status: 'pending',
        vaultFileId: got.vaultFileId,
        expectedFilename: opts.expectedFilename || got.fileName,
      })
      return got
    }
  }

  // Direct file_id on job even without attachment row
  if (opts.telegramFileId) {
    try {
      const hit = await downloadTelegramFileCascaded({
        fileId: opts.telegramFileId,
        fileName: opts.expectedFilename,
        chatId: opts.chatId,
        messageId: opts.messageId,
      })
      const name =
        opts.expectedFilename ||
        (hit.filePath.includes('/')
          ? hit.filePath.slice(hit.filePath.lastIndexOf('/') + 1)
          : hit.filePath) ||
        'telegram-file.bin'
      const saved = await saveWorkspaceFile({
        scopeId: opts.scopeId,
        buffer: hit.buffer,
        originalName: name,
        mimeType: 'application/octet-stream',
      })
      await persistTelegramAttachment({
        chatId: opts.chatId,
        scopeId: opts.scopeId,
        telegramFileId: opts.telegramFileId,
        messageId: opts.messageId,
        fileName: saved.file.originalName,
        mimeType: saved.file.mimeType,
        sizeBytes: hit.buffer.byteLength,
        vaultFileId: saved.file.id,
        hasBytes: true,
      })
      await updateTelegramFileJob(opts.jobId, {
        status: 'pending',
        vaultFileId: saved.file.id,
        expectedFilename: saved.file.originalName,
      })
      return {
        vaultFileId: saved.file.id,
        fileName: saved.file.originalName,
      }
    } catch (e) {
      console.warn(
        '[telegram] job cascade download failed',
        opts.jobId,
        e instanceof Error ? e.message : e
      )
    }
  }

  return null
}
