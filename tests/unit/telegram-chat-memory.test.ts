import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rooms/telegram-feed', () => ({
  listTelegramFeed: vi.fn(async (_scopeId: string, _limit?: number, opts?: { externalId?: string }) => ({
    ok: true,
    items: [
      {
        id: '1',
        textAr: 'اسمي للتجربة: خالد',
        source: 'telegram' as const,
        sourceLabelAr: 'تيليجرام',
        senderAr: 'مستخدم',
        atIso: '2026-08-10T10:00:00.000Z',
        atAr: '١٠ أغسطس ١٠:٠٠',
      },
      {
        id: '2',
        textAr: 'تم — سأتذكر.',
        source: 'bot' as const,
        sourceLabelAr: 'بوت',
        senderAr: 'الوكيل',
        atIso: '2026-08-10T10:01:00.000Z',
        atAr: '١٠ أغسطس ١٠:٠١',
      },
    ].filter(() => Boolean(opts?.externalId || true)),
  })),
}))

vi.mock('@/lib/telegram/file-jobs', () => ({
  listOpenTelegramFileJobs: vi.fn(async () => []),
}))

vi.mock('@/lib/telegram/attachment-persist', () => ({
  listPersistedTelegramAttachments: vi.fn(async () => [
    {
      id: 'a1',
      chatId: 'chat-99',
      scopeId: 'scope-1',
      fileName: 'مرفق-تجريبي.pdf',
      mimeType: 'application/pdf',
      vaultFileId: 'vault-1',
      hasBytes: true,
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    },
  ]),
}))

vi.mock('@/lib/telegram/recent-media', () => ({
  getRecentTelegramMedia: vi.fn(() => [
    {
      fileId: 'vault-1',
      name: 'مرفق-تجريبي.pdf',
      mimeType: 'application/pdf',
      scopeId: 'scope-1',
      at: Date.now(),
    },
  ]),
}))

vi.mock('@/lib/rooms/room-memory', () => ({
  listRoomMemories: vi.fn(async () => [
    {
      id: 'm1',
      scopeId: 'scope-1',
      content: 'اللجنة تجتمع الأحد مساءً بتوقيت الرياض',
      createdBy: null,
      createdByAr: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'm2',
      scopeId: 'scope-1',
      content:
        '[ملخص أسبوعي تيليجرام] · 2026-W32 · chat=chat-99 · أعضاء≈12 · موضوعات: اللجنة، التقرير',
      createdBy: 'digest',
      createdByAr: 'ملخص أسبوعي تيليجرام',
      createdAt: '2026-08-06T12:00:00.000Z',
    },
  ]),
}))

describe('buildTelegramChatMemoryAr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scopes memory to chatId and includes TG attachments + remember rules', async () => {
    const { listTelegramFeed } = await import('@/lib/rooms/telegram-feed')
    const { buildTelegramChatMemoryAr } = await import(
      '@/lib/telegram/chat-memory'
    )
    const ar = await buildTelegramChatMemoryAr({
      scopeId: 'scope-1',
      chatId: 'chat-99',
      feedLimit: 20,
    })
    expect(listTelegramFeed).toHaveBeenCalledWith('scope-1', 20, {
      externalId: 'chat-99',
    })
    expect(ar).toMatch(/خالد/)
    expect(ar).toMatch(/مرفق-تجريبي/)
    expect(ar).toMatch(/هذه المحادثة فقط/)
    expect(ar).toMatch(/حقائق ثابتة/)
    expect(ar).toMatch(/اللجنة تجتمع/)
    expect(ar).toMatch(/ملخص أسبوعي أخير/)
    expect(ar).toMatch(/2026-W32/)
    expect(ar).toMatch(/اختصارات|رد موجز|رد واحد/)
    expect(ar).toMatch(/صوت → مستند/)
    expect(ar).toMatch(/write_file/)
    expect(ar).toMatch(/geocode/)
    expect(ar).toMatch(/web_search/)
  })
})
