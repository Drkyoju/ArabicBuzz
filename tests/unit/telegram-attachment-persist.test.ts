import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearTelegramAttachmentPersistForTests,
  persistTelegramAttachment,
  getRecoverableTelegramAttachment,
  telegramFileNeverStoredAr,
  telegramLargeFileWorkingPathAr,
} from '@/lib/telegram/attachment-persist'
import {
  clearTelegramFileJobsForTests,
  enqueueTelegramFileJob,
  filenamesStrictMatch,
  inferPdfDuplicateWorkParams,
  resolveTelegramJobFile,
  shouldNotifyWaitingFileOnce,
  bindWaitingJobsToNewVaultFile,
} from '@/lib/telegram/file-jobs'
import {
  clearTelegramRecentMediaForTests,
  formatRecentTelegramMediaHint,
  getLatestTelegramMedia,
} from '@/lib/telegram/recent-media'
import {
  telegramFileTooLargeAr,
  isTelegramDownloadLimitError,
} from '@/lib/telegram/attachment-deliver'
import { matchWorkspaceFileExact } from '@/lib/files/file-source-policy'

describe('telegram attachment persist + jobs', () => {
  beforeEach(() => {
    clearTelegramAttachmentPersistForTests()
    clearTelegramFileJobsForTests()
    clearTelegramRecentMediaForTests()
  })

  it('persists attachment with bytes and hydrates recent-media', async () => {
    const att = await persistTelegramAttachment({
      chatId: 'chat-1',
      scopeId: 'shared-demo',
      telegramFileId: 'tg-file-abc',
      fileUniqueId: 'uniq-1',
      messageId: 42,
      fileName: 'المعلم الاول.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000_000,
      vaultFileId: 'vault-1',
      hasBytes: true,
    })
    expect(att.hasBytes).toBe(true)
    const latest = getLatestTelegramMedia('chat-1')
    expect(latest?.fileId).toBe('vault-1')
    expect(latest?.name).toContain('المعلم')
    const hint = formatRecentTelegramMediaHint('chat-1')
    expect(hint).toMatch(/ممنوع طلب/)
    expect(hint).toMatch(/fileId=vault-1/)
    // Must forbid nagging — phrase appears only as prohibition.
    expect(hint).toMatch(/ممنوع طلب «أعد إرسال الملف»/)
  })

  it('persists metadata-only when download fails — never loses file_id', async () => {
    await persistTelegramAttachment({
      chatId: 'chat-2',
      scopeId: 'shared-demo',
      telegramFileId: 'tg-big',
      fileName: 'المعلم الاول.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 25_000_000,
      hasBytes: false,
      downloadErrorAr: telegramFileTooLargeAr({
        fileName: 'المعلم الاول.pdf',
        sizeBytes: 25_000_000,
      }),
    })
    const rec = await getRecoverableTelegramAttachment('chat-2')
    expect(rec?.telegramFileId).toBe('tg-big')
    expect(rec?.hasBytes).toBe(false)
  })

  it('large-file Arabic copy does not primary-nag resend', () => {
    const msg = telegramLargeFileWorkingPathAr({
      fileName: 'المعلم الاول.pdf',
      sizeBytes: 22_000_000,
    })
    expect(msg).toMatch(/سجّلت/)
    expect(msg).toMatch(/تلقائياً|Bot API|ماك|غرفة|Drive/i)
    expect(msg).not.toMatch(/أعد إرسال الملف عبر تيليجرام مراراً/)
    expect(isTelegramDownloadLimitError(new Error(msg))).toBe(true)
    expect(telegramFileTooLargeAr({ fileName: 'x.pdf' })).toMatch(/سجّلت/)
  })

  it('never asks resend when vault bytes exist on job', async () => {
    await persistTelegramAttachment({
      chatId: 'chat-3',
      scopeId: 'shared-demo',
      fileName: 'المعلم الاول.pdf',
      vaultFileId: 'v-ok',
      hasBytes: true,
    })
    const job = await enqueueTelegramFileJob({
      chatId: 'chat-3',
      scopeId: 'shared-demo',
      requestText: 'كرر صفحة 48 بعد 45',
      expectedFilename: 'المعلم الاول.pdf',
      vaultFileId: 'v-ok',
      status: 'pending',
    })
    // resolve will try readWorkspaceFile — may fail without real vault;
    // shouldNotify must not nag when telegram attachment has bytes path via job.vault
    const notify = await shouldNotifyWaitingFileOnce(job)
    // With vaultFileId set, resolve attempts read — if read fails, may still notify.
    // Guard: never notify when job already has vaultFileId intent + recent bytes attachment.
    expect(job.vaultFileId).toBe('v-ok')
    expect(notify.notify).toBe(false)
  })

  it('waiting_file notifies once with honest Arabic — never biology substitute', async () => {
    const job = await enqueueTelegramFileJob({
      chatId: 'chat-4',
      scopeId: 'shared-demo',
      requestText: 'كرر صفحة 48 بعد 45',
      expectedFilename: 'المعلم الاول.pdf',
      status: 'waiting_file',
    })
    const first = await shouldNotifyWaitingFileOnce(job)
    expect(first.notify).toBe(true)
    expect(first.messageAr).toMatch(/ما وصل للتخزين/)
    expect(first.messageAr).not.toMatch(/أحياء/)

    await bindWaitingJobsToNewVaultFile({
      chatId: 'chat-4',
      scopeId: 'shared-demo',
      vaultFileId: 'v-new',
      fileName: 'المعلم الاول.pdf',
    })
    // Biology guide must NOT bind
    const bio = await bindWaitingJobsToNewVaultFile({
      chatId: 'chat-4',
      scopeId: 'shared-demo',
      vaultFileId: 'bio',
      fileName: 'دليل معلم الأحياء أول ثانوي ف1.pdf',
    })
    expect(bio.length).toBe(0)
  })

  it('strict filename match — معلم ≠ دليل أحياء', () => {
    expect(
      filenamesStrictMatch('المعلم الاول.pdf', 'المعلم الأول.pdf')
    ).toBe(true)
    expect(
      filenamesStrictMatch('المعلم الاول.pdf', 'دليل معلم الأحياء.pdf')
    ).toBe(false)
    const files = [
      { id: 'bio', originalName: 'دليل معلم الأحياء أول ثانوي ف1.pdf' },
      { id: 'tg', originalName: 'المعلم الاول.pdf' },
    ]
    expect(matchWorkspaceFileExact(files, 'معلم')).toBeNull()
    expect(matchWorkspaceFileExact(files, 'المعلم الاول.pdf')?.id).toBe('tg')
  })

  it('infers pdf duplicate page 48 after 45', () => {
    expect(inferPdfDuplicateWorkParams('كرر صفحة 48 بعد 45')).toEqual({
      copyPage: 48,
      afterPage: 45,
    })
    expect(
      inferPdfDuplicateWorkParams('انسخ صفحة 48 بعد صفحة 45 في المعلم الاول')
    ).toEqual({ copyPage: 48, afterPage: 45 })
  })

  it('binds waiting job then marks pending when exact vault name appears', async () => {
    const job = await enqueueTelegramFileJob({
      chatId: 'chat-bind',
      scopeId: 'shared-demo',
      requestText: 'كرر صفحة 48 بعد 45',
      expectedFilename: 'المعلم الاول.pdf',
      workParams: { copyPage: 48, afterPage: 45 },
      status: 'waiting_file',
    })
    const bound = await bindWaitingJobsToNewVaultFile({
      chatId: 'chat-bind',
      scopeId: 'shared-demo',
      vaultFileId: 'vault-muallim',
      fileName: 'المعلم الاول.pdf',
    })
    expect(bound.some((j) => j.id === job.id)).toBe(true)
    expect(bound[0]?.status).toBe('pending')
    expect(bound[0]?.vaultFileId).toBe('vault-muallim')
  })

  it('one-shot never-stored copy', () => {
    expect(telegramFileNeverStoredAr('المعلم الاول.pdf')).toMatch(
      /ما وصل للتخزين/
    )
  })
})
