import { describe, expect, it } from 'vitest'
import {
  assertFileSourceToolAllowed,
  assertResolvedFileAllowed,
  matchWorkspaceFileExact,
  parseTelegramAttachmentFileIds,
  runWithFileSourceLock,
  telegramAttachmentMissingAr,
} from '@/lib/files/file-source-policy'

describe('file-source-policy', () => {
  it('exact match only — never fuzzy معلم→دليل معلم الأحياء', () => {
    const files = [
      {
        id: 'bio',
        originalName: 'دليل معلم الأحياء أول ثانوي ف1.pdf',
      },
      { id: 'tg', originalName: 'المعلم الاول.pdf' },
    ]
    expect(matchWorkspaceFileExact(files, 'معلم')).toBeNull()
    expect(matchWorkspaceFileExact(files, 'المعلم الاول.pdf')?.id).toBe('tg')
    expect(matchWorkspaceFileExact(files, 'tg')?.id).toBe('tg')
  })

  it('parses telegram attachment fileIds from prompt', () => {
    const p = parseTelegramAttachmentFileIds(
      'ملف مرفوع من تيليجرام: «المعلم الاول.pdf» (fileId=abc-123-def, mime=application/pdf).'
    )
    expect(p.fileIds).toEqual(['abc-123-def'])
    expect(p.names[0]).toContain('المعلم')
  })

  it('blocks Drive open tools under TG lock', async () => {
    await runWithFileSourceLock(
      { lockedTelegramFileIds: ['abc'], lockedNames: ['المعلم الاول.pdf'] },
      async () => {
        expect(() => assertFileSourceToolAllowed('brain_open_document')).toThrow(
          /مرفق تيليجرام/
        )
        expect(() => assertFileSourceToolAllowed('drive_search_files')).toThrow(
          /مرفق تيليجرام/
        )
        expect(() => assertFileSourceToolAllowed('read_document')).not.toThrow()
      }
    )
  })

  it('rejects resolving a different vault file under lock', async () => {
    await runWithFileSourceLock(
      { lockedTelegramFileIds: ['tg-only'], lockedNames: ['المعلم الاول.pdf'] },
      async () => {
        expect(() =>
          assertResolvedFileAllowed(
            { id: 'bio', originalName: 'دليل معلم الأحياء.pdf' },
            'معلم'
          )
        ).toThrow(/ممنوع استبدال/)
        expect(() =>
          assertResolvedFileAllowed(
            { id: 'tg-only', originalName: 'المعلم الاول.pdf' },
            'tg-only'
          )
        ).not.toThrow()
      }
    )
  })

  it('missing attachment copy is Arabic and clear', () => {
    expect(telegramAttachmentMissingAr('المعلم الاول.pdf')).toMatch(/لن أستخدم/)
  })
})
