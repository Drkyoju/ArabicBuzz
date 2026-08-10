import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rooms/telegram-feed', () => ({
  listTelegramFeed: vi.fn(async () => ({
    ok: true,
    items: [
      {
        id: '1',
        textAr: 'اللجنة تجتمع الخميس مساءً بتوقيت الرياض',
        source: 'telegram' as const,
        sourceLabelAr: 'تيليجرام',
        senderAr: 'أحمد',
        atIso: '2026-08-06T10:00:00.000Z',
        atAr: '٦ أغسطس ١٣:٠٠',
      },
      {
        id: '2',
        textAr: 'أرسلنا ملف التقرير',
        source: 'telegram' as const,
        sourceLabelAr: 'تيليجرام',
        senderAr: 'سارة',
        atIso: '2026-08-07T10:00:00.000Z',
        atAr: '٧ أغسطس ١٣:٠٠',
        attachments: [{ name: 'تقرير.pdf', fileId: 'f1' }],
      },
      {
        id: '3',
        textAr: 'تم الأرشفة.',
        source: 'bot' as const,
        sourceLabelAr: 'بوت',
        senderAr: 'الوكيل',
        atIso: '2026-08-07T10:01:00.000Z',
        atAr: '٧ أغسطس ١٣:٠١',
      },
    ],
  })),
}))

vi.mock('@/lib/telegram/file-jobs', () => ({
  listOpenTelegramFileJobs: vi.fn(async () => [
    {
      id: 'job-abcdef12',
      status: 'open',
      requestText: 'انسخ صفحة فاضية بعد ٤٥',
      expectedFilename: 'المعلم.pdf',
      workParams: {},
    },
  ]),
}))

vi.mock('@/lib/rooms/room-memory', () => ({
  listRoomMemories: vi.fn(async () => []),
  addRoomMemory: vi.fn(async (opts: { content: string }) => ({
    id: 'm1',
    scopeId: 'shared-demo',
    content: opts.content,
    createdBy: 'digest',
    createdByAr: 'ملخص أسبوعي تيليجرام',
    createdAt: new Date().toISOString(),
  })),
}))

vi.mock('@/lib/channels/bindings', () => ({
  listUniqueTelegramDigestTargets: vi.fn(async () => [
    { scopeId: 'shared-demo', chatId: '-1003855925966' },
  ]),
}))

vi.mock('@/lib/digest/day-claim', () => ({
  claimDigestDayKey: vi.fn(async () => true),
}))

vi.mock('@/lib/notifications/emit', () => ({
  emitNotification: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/app-url', () => ({
  appBaseUrl: () => 'https://arabicbuzz-fooc9h.cranl.net',
}))

describe('weekly-group-chat digest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds MSA weekly rollup with stable facts and open jobs', async () => {
    const { buildWeeklyGroupChatDigestAr, WEEKLY_CHAT_MEMORY_PREFIX } =
      await import('@/lib/digest/weekly-group-chat')
    const built = await buildWeeklyGroupChatDigestAr({
      scopeId: 'shared-demo',
      chatId: '-1003855925966',
      weekKey: '2026-W32',
    })
    expect(built.hasContent).toBe(true)
    expect(built.textAr).toMatch(/ملخص أسبوعي/)
    expect(built.textAr).toMatch(/عمل الجمعية/)
    expect(built.textAr).toMatch(/بلا تكرار/)
    expect(built.textAr).toMatch(/اللجنة/)
    expect(built.textAr).toMatch(/مهام ملفات/)
    expect(built.memoryLine).toMatch(WEEKLY_CHAT_MEMORY_PREFIX)
    expect(built.memoryLine).toMatch(/2026-W32/)
  })

  it('sends once when forced and persists room memory line', async () => {
    const { sendWeeklyGroupChatDigests } = await import(
      '@/lib/digest/weekly-group-chat'
    )
    const { emitNotification } = await import('@/lib/notifications/emit')
    const { addRoomMemory } = await import('@/lib/rooms/room-memory')
    const out = await sendWeeklyGroupChatDigests({
      force: true,
      now: new Date('2026-08-06T12:00:00+03:00'), // Thursday Riyadh
    })
    expect(out.windowOk).toBe(true)
    expect(out.results[0]?.sent).toBe(true)
    expect(emitNotification).toHaveBeenCalled()
    expect(addRoomMemory).toHaveBeenCalled()
  })

  it('skips outside Thursday afternoon window without force', async () => {
    const { sendWeeklyGroupChatDigests, isWeeklyGroupDigestWindow } =
      await import('@/lib/digest/weekly-group-chat')
    // Monday morning Riyadh
    const monday = new Date('2026-08-10T08:00:00+03:00')
    expect(isWeeklyGroupDigestWindow(monday)).toBe(false)
    const out = await sendWeeklyGroupChatDigests({ now: monday })
    expect(out.windowOk).toBe(false)
    expect(out.results).toEqual([])
  })
})
