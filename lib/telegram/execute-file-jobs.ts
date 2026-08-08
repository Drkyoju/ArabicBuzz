/**
 * Execute ready Telegram file jobs without waiting for the next user message.
 * Prefer deterministic tools (pdf_duplicate_page) then sendDocument to the group.
 */
import {
  inferPdfDuplicateWorkParams,
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

async function executeOneJob(job: TelegramFileJob): Promise<{
  ok: boolean
  sentName?: string
  errorAr?: string
}> {
  const vaultId = job.vaultFileId
  if (!vaultId) {
    return { ok: false, errorAr: 'لا vault_file_id للمهمة' }
  }

  await updateTelegramFileJob(job.id, { status: 'running' })

  const dup =
    inferPdfDuplicateWorkParams(job.requestText) ||
    (typeof job.workParams.copyPage === 'number' &&
    typeof job.workParams.afterPage === 'number'
      ? {
          copyPage: Number(job.workParams.copyPage),
          afterPage: Number(job.workParams.afterPage),
        }
      : null)

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
        copyPage: dup.copyPage,
        afterPage: dup.afterPage,
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

    if (file.buffer.byteLength > TELEGRAM_MAX_UPLOAD_BYTES) {
      const mb = (file.buffer.byteLength / (1024 * 1024)).toFixed(1)
      const { emitNotification } = await import('@/lib/notifications/emit')
      await emitNotification({
        channel: 'telegram',
        to: job.chatId,
        textAr: [
          captionAr,
          `الملف الناتج «${file.meta.originalName}» (~${mb} م.ب) محفوظ في خزنة الغرفة — تجاوز حد إرسال تيليجرام. افتحه من الموقع.`,
        ].join('\n'),
        meta: { scopeId: job.scopeId },
      })
      await updateTelegramFileJob(job.id, {
        status: 'done',
        resultVaultFileId: resultFileId,
        resultName: file.meta.originalName,
      })
      return { ok: true, sentName: file.meta.originalName }
    }

    const { emitTelegramDocument } = await import('@/lib/notifications/emit')
    const sent = await emitTelegramDocument({
      buffer: file.buffer,
      filename: file.meta.originalName || resultName,
      captionAr,
      to: job.chatId,
      meta: { scopeId: job.scopeId },
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
}): Promise<ExecuteFileJobsResult> {
  const prepared = await prepareTelegramFileJobResumes({
    chatId: opts?.chatId,
    scopeId: opts?.scopeId,
    limit: opts?.limit ?? 20,
  })

  const sent: string[] = []
  const failed: string[] = []

  for (const r of prepared.ready) {
    const out = await executeOneJob(r.job)
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
}): Promise<ExecuteFileJobsResult> {
  await onVaultFileSavedMaybeResume(opts)
  return runReadyTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: 10,
  })
}
