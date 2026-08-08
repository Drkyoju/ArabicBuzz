/**
 * Full Telegram group conversation memory for the bot → agent pool.
 * Agents must see prior turns + open file jobs, not only the last message.
 */
import { listTelegramFeed } from '@/lib/rooms/telegram-feed'
import { listPersistedTelegramAttachments } from '@/lib/telegram/attachment-persist'
import { listOpenTelegramFileJobs } from '@/lib/telegram/file-jobs'

export async function buildTelegramGroupChatMemoryAr(opts: {
  scopeId: string
  chatId: string
  /** Max mirrored feed lines (oldest→newest in the block). */
  feedLimit?: number
}): Promise<string> {
  const feedLimit = Math.min(Math.max(opts.feedLimit ?? 40, 8), 80)
  const [feed, openJobs, atts] = await Promise.all([
    listTelegramFeed(opts.scopeId, feedLimit).catch(() => ({
      ok: false as const,
      items: [] as Awaited<ReturnType<typeof listTelegramFeed>>['items'],
    })),
    listOpenTelegramFileJobs({
      chatId: opts.chatId,
      scopeId: opts.scopeId,
      limit: 12,
    }).catch(() => []),
    listPersistedTelegramAttachments(opts.chatId, 12).catch(() => []),
  ])

  const lines: string[] = [
    '## ذاكرة محادثة مجموعة تيليجرام (كاملة قدر الإمكان)',
    'استخدم هذا السياق قبل أي سؤال توضيحي. نفّذ الطلبات المعلّقة على الملفات إن وُجدت.',
  ]

  if (feed.ok && feed.items.length) {
    lines.push('', '### سجل المحادثة (الأقدم → الأحدث)')
    for (const item of feed.items) {
      const who = item.senderAr || item.sourceLabelAr
      const text = String(item.textAr || '').trim().slice(0, 500)
      if (!text) continue
      lines.push(`- [${item.atAr}] ${who}: ${text}`)
    }
  } else {
    lines.push('', '### سجل المحادثة', '- (لا مرآة غرفة بعد — اعتمد الرسالة الحالية + المهام المعلّقة)')
  }

  if (openJobs.length) {
    lines.push('', '### مهام ملفات معلّقة (أولوية تنفيذ)')
    for (const j of openJobs) {
      const params =
        typeof j.workParams.copyPage === 'number' &&
        typeof j.workParams.afterPage === 'number'
          ? ` · pdf_duplicate_page copyPage=${j.workParams.copyPage} afterPage=${j.workParams.afterPage}`
          : ''
      lines.push(
        [
          `- #${j.id.slice(0, 8)} status=${j.status}`,
          `طلب: ${j.requestText.slice(0, 220)}`,
          j.expectedFilename ? `ملف: «${j.expectedFilename}»` : '',
          j.vaultFileId ? `vault=${j.vaultFileId}` : 'بلا بايتات بعد',
          j.telegramFileId ? `tgFileId=موجود` : '',
          params,
        ]
          .filter(Boolean)
          .join(' · ')
      )
    }
  }

  if (atts.length) {
    lines.push('', '### مرفقات مرآة تيليجرام الأخيرة')
    for (const a of atts.slice(0, 8)) {
      if (/أحياء|احياء|biology/i.test(a.fileName)) continue
      lines.push(
        `- «${a.fileName}» · ${a.hasBytes ? 'بايتات جاهزة' : 'بيانات فقط'} · ${a.sizeBytes ? `≈${(a.sizeBytes / (1024 * 1024)).toFixed(1)}م.ب` : ''}`
      )
    }
  }

  lines.push(
    '',
    'قواعد: لا تطلب إعادة إرسال. لا تستبدل بملف أحياء. إن وُجدت مهمة نسخ صفحة نفّذ pdf_duplicate_page ثم return_file عبر وكلاء الغرفة.'
  )
  return lines.join('\n')
}
