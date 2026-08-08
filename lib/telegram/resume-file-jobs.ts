/**
 * Resume unfinished Telegram file jobs for a chat (or globally via cron).
 */
import {
  bindWaitingJobsToNewVaultFile,
  buildResumePromptForJob,
  listOpenTelegramFileJobs,
  markJobWaitingFileNotified,
  resolveTelegramJobFile,
  shouldNotifyWaitingFileOnce,
  updateTelegramFileJob,
  type TelegramFileJob,
} from '@/lib/telegram/file-jobs'
import { hydrateRecentMediaFromPersist } from '@/lib/telegram/attachment-persist'

export type ResumeFileJobsResult = {
  jobsChecked: number
  ready: Array<{ job: TelegramFileJob; prompt: string }>
  notifiedWaiting: string[]
}

/**
 * Hydrate media + find open jobs that now have a recoverable file.
 * Does not execute the agent — caller runs prompts.
 */
export async function prepareTelegramFileJobResumes(opts: {
  chatId?: string
  scopeId?: string
  limit?: number
}): Promise<ResumeFileJobsResult> {
  if (opts.chatId) {
    await hydrateRecentMediaFromPersist(opts.chatId)
  }

  const open = await listOpenTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: opts.limit ?? 12,
  })

  const ready: ResumeFileJobsResult['ready'] = []
  const notifiedWaiting: string[] = []

  for (const job of open) {
    const resolved = await resolveTelegramJobFile(job)
    if (resolved) {
      await updateTelegramFileJob(job.id, {
        status: 'pending',
        vaultFileId: resolved.vaultFileId,
        expectedFilename: job.expectedFilename || resolved.fileName,
        lastErrorAr: undefined,
      })
      const refreshed = {
        ...job,
        vaultFileId: resolved.vaultFileId,
        expectedFilename: job.expectedFilename || resolved.fileName,
        status: 'pending' as const,
      }
      ready.push({
        job: refreshed,
        prompt: buildResumePromptForJob(refreshed, resolved),
      })
      continue
    }

    const wait = await shouldNotifyWaitingFileOnce(job)
    if (wait.notify && wait.messageAr) {
      await markJobWaitingFileNotified(job.id)
      notifiedWaiting.push(wait.messageAr)
    }
  }

  return { jobsChecked: open.length, ready, notifiedWaiting }
}

export async function onVaultFileSavedMaybeResume(opts: {
  chatId?: string
  scopeId: string
  vaultFileId: string
  fileName: string
}): Promise<TelegramFileJob[]> {
  return bindWaitingJobsToNewVaultFile(opts)
}
