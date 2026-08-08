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

  // Reconcile: attach latest TG mirror file_ids onto open jobs that hold the real ask.
  try {
    const { bindOpenJobsToIncomingTelegramFile } = await import(
      '@/lib/telegram/file-jobs'
    )
    const { listPersistedTelegramAttachments } = await import(
      '@/lib/telegram/attachment-persist'
    )
    const { matchMuallimSeerahFile } = await import(
      '@/lib/files/muallim-seerah-match'
    )
    const chats = opts.chatId
      ? [opts.chatId]
      : Array.from(
          new Set(
            (
              await listOpenTelegramFileJobs({
                scopeId: opts.scopeId,
                limit: 40,
              })
            ).map((j) => j.chatId)
          )
        )
    for (const chatId of chats) {
      const atts = await listPersistedTelegramAttachments(chatId, 16)
      for (const a of atts) {
        if (/أحياء|احياء|biology/i.test(a.fileName)) continue
        if (!a.telegramFileId && !a.vaultFileId) continue
        if (
          !matchMuallimSeerahFile(a.fileName) &&
          !opts.chatId // only force-bind seerah globally; chat-scoped binds all names via open jobs
        ) {
          continue
        }
        await bindOpenJobsToIncomingTelegramFile({
          chatId,
          scopeId: opts.scopeId || a.scopeId,
          fileName: a.fileName,
          telegramFileId: a.telegramFileId,
          attachmentId: a.id,
          vaultFileId: a.vaultFileId,
          sizeBytes: a.sizeBytes,
        })
      }
    }
  } catch (e) {
    console.warn('[telegram] reconcile open jobs', e)
  }

  const open = await listOpenTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: opts.limit ?? 12,
  })

  const ready: ResumeFileJobsResult['ready'] = []
  const notifiedWaiting: string[] = []

  for (const job of open) {
    let working: TelegramFileJob = job
    // Free cascade: local Bot API / Mac hop before waiting_file notify
    if (
      (job.status === 'waiting_file' || job.status === 'failed') &&
      (job.telegramFileId || job.attachmentId)
    ) {
      try {
        const { tryFillWaitingJobFromTelegramCascade } = await import(
          '@/lib/telegram/retry-large-download'
        )
        const filled = await tryFillWaitingJobFromTelegramCascade({
          jobId: job.id,
          chatId: job.chatId,
          scopeId: job.scopeId,
          expectedFilename: job.expectedFilename || undefined,
          telegramFileId: job.telegramFileId,
        })
        if (filled) {
          working = {
            ...job,
            vaultFileId: filled.vaultFileId,
            expectedFilename: job.expectedFilename || filled.fileName,
            status: 'pending',
          }
        }
      } catch (e) {
        console.warn('[telegram] cascade fill', job.id, e)
      }
    }

    const resolved = await resolveTelegramJobFile(working)
    if (resolved) {
      await updateTelegramFileJob(working.id, {
        status: 'pending',
        vaultFileId: resolved.vaultFileId,
        expectedFilename: working.expectedFilename || resolved.fileName,
        lastErrorAr: undefined,
      })
      const refreshed = {
        ...working,
        vaultFileId: resolved.vaultFileId,
        expectedFilename: working.expectedFilename || resolved.fileName,
        status: 'pending' as const,
      }
      ready.push({
        job: refreshed,
        prompt: buildResumePromptForJob(refreshed, resolved),
      })
      continue
    }

    const wait = await shouldNotifyWaitingFileOnce(working)
    if (wait.notify && wait.messageAr) {
      await markJobWaitingFileNotified(working.id)
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
