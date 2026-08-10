/**
 * Execute ready Telegram file jobs without waiting for the next user message.
 * Prefer deterministic tools (pdf_duplicate_page) then sendDocument to the group.
 */
import {
  resolvePdfDuplicateParams,
  updateTelegramFileJob,
  type TelegramFileJob,
} from '@/lib/telegram/file-jobs'
import {
  onVaultFileSavedMaybeResume,
  prepareTelegramFileJobResumes,
} from '@/lib/telegram/resume-file-jobs'
import { TELEGRAM_MAX_UPLOAD_BYTES } from '@/lib/telegram/attachment-deliver'

export type ExecuteFileJobsResult = {
  checked: number
  executed: number
  sent: string[]
  failed: string[]
  waitingNotices: number
}

async function executeOneJob(
  job: TelegramFileJob,
  opts?: { solicited?: boolean }
): Promise<{
  ok: boolean
  sentName?: string
  errorAr?: string
}> {
  const vaultId = job.vaultFileId
  if (!vaultId) {
    return { ok: false, errorAr: 'لا vault_file_id للمهمة' }
  }

  await updateTelegramFileJob(job.id, { status: 'running' })

  const dup = resolvePdfDuplicateParams(job)
  const sendMeta = {
    scopeId: job.scopeId,
    ...(opts?.solicited ? { solicited: true, inboundReply: true } : {}),
  }

  try {
    let resultFileId = vaultId
    let resultName = job.expectedFilename || 'result.pdf'
    let captionAr = `تم استئناف المهمة على «${resultName}».`

    if (dup) {
      const { executePdfDuplicatePage } = await import(
        '@/lib/agents/tools/pdf-tools'
      )
      const out = await executePdfDuplicatePage('pdf_duplicate_page', {
        scopeId: job.scopeId,
        fileId: vaultId,
        afterPage: dup.afterPage,
        ...(dup.findEmptyPage
          ? { findEmptyPage: true }
          : { copyPage: dup.copyPage }),
      })
      resultFileId = String(out.fileId)
      resultName = String(out.name)
      captionAr = String(out.messageAr || captionAr)
    } else {
      captionAr = [
        `وجدت الملف «${resultName}» وأكملت الاستئناف.`,
        job.requestText ? `الطلب: ${job.requestText.slice(0, 200)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }

    const { readWorkspaceFile } = await import('@/lib/documents/workspace')
    const file = await readWorkspaceFile(job.scopeId, resultFileId)

    const { isLocalTelegramBotApiConfigured } = await import(
      '@/lib/telegram/bot-api-root'
    )
    const localBot = isLocalTelegramBotApiConfigured()
    // Cloud Bot API ~50MB; Local Bot API raises sendDocument well past that.
    if (file.buffer.byteLength > TELEGRAM_MAX_UPLOAD_BYTES && !localBot) {
      const mb = (file.buffer.byteLength / (1024 * 1024)).toFixed(1)
      const { emitNotification } = await import('@/lib/notifications/emit')
      await emitNotification({
        channel: 'telegram',
        to: job.chatId,
        textAr: [
          captionAr,
          `الملف الناتج «${file.meta.originalName}» (~${mb} م.ب) محفوظ في خزنة الغرفة — تجاوز حد إرسال تيليجرام. افتحه من الموقع.`,
        ].join('\n'),
        meta: sendMeta,
      })
      await updateTelegramFileJob(job.id, {
        status: 'done',
        resultVaultFileId: resultFileId,
        resultName: file.meta.originalName,
      })
      try {
        const { pushVaultToDriveBestEffort } = await import(
          '@/lib/telegram/storage-mesh'
        )
        void pushVaultToDriveBestEffort({
          scopeId: job.scopeId,
          vaultFileId: resultFileId,
          fileName: file.meta.originalName || resultName,
        })
      } catch {
        /* non-fatal */
      }
      return { ok: true, sentName: file.meta.originalName }
    }

    const { emitTelegramDocument } = await import('@/lib/notifications/emit')
    const sent = await emitTelegramDocument({
      buffer: file.buffer,
      filename: file.meta.originalName || resultName,
      captionAr,
      to: job.chatId,
      meta: sendMeta,
    })
    if (!sent.ok) {
      await updateTelegramFileJob(job.id, {
        status: 'failed',
        lastErrorAr: sent.error || 'فشل sendDocument',
        resultVaultFileId: resultFileId,
        resultName: file.meta.originalName,
      })
      return { ok: false, errorAr: sent.error || 'فشل sendDocument' }
    }

    await updateTelegramFileJob(job.id, {
      status: 'done',
      resultVaultFileId: resultFileId,
      resultName: file.meta.originalName,
    })

    // Best-effort Drive brain archive of the job result (same path as group-archive).
    try {
      const { pushVaultToDriveBestEffort } = await import(
        '@/lib/telegram/storage-mesh'
      )
      void pushVaultToDriveBestEffort({
        scopeId: job.scopeId,
        vaultFileId: resultFileId,
        fileName: file.meta.originalName || resultName,
      })
    } catch {
      /* non-fatal */
    }

    return { ok: true, sentName: file.meta.originalName }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateTelegramFileJob(job.id, {
      status: 'failed',
      lastErrorAr: msg,
    })
    return { ok: false, errorAr: msg }
  }
}

/**
 * Resolve open jobs then execute those that have recoverable bytes.
 */
export async function runReadyTelegramFileJobs(opts?: {
  chatId?: string
  scopeId?: string
  limit?: number
  /** True when continuing work from an inbound Telegram update. */
  solicited?: boolean
}): Promise<ExecuteFileJobsResult> {
  const prepared = await prepareTelegramFileJobResumes({
    chatId: opts?.chatId,
    scopeId: opts?.scopeId,
    limit: opts?.limit ?? 20,
  })

  const sent: string[] = []
  const failed: string[] = []

  for (const r of prepared.ready) {
    const out = await executeOneJob(r.job, { solicited: opts?.solicited })
    if (out.ok && out.sentName) sent.push(out.sentName)
    else if (!out.ok) failed.push(out.errorAr || r.job.id)
  }

  return {
    checked: prepared.jobsChecked,
    executed: sent.length,
    sent,
    failed,
    waitingNotices: prepared.notifiedWaiting.length,
  }
}

/**
 * After a vault file is saved (TG ingest or site upload): bind waiting jobs + execute.
 */
export async function afterVaultFileMaybeRunTelegramJobs(opts: {
  chatId?: string
  scopeId: string
  vaultFileId: string
  fileName: string
  solicited?: boolean
}): Promise<ExecuteFileJobsResult> {
  await onVaultFileSavedMaybeResume(opts)
  return runReadyTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: 10,
    // Default solicited when a chatId is present (inbound TG / linked group path).
    solicited: opts.solicited ?? Boolean(opts.chatId),
  })
}
