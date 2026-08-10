/**
 * Durable Telegram conversation memory for the bot → agent pool.
 * Agents must see prior turns + open file jobs + recent TG attachments —
 * not only the last message. Scoped per chatId (DM or group).
 */
import { listTelegramFeed } from '@/lib/rooms/telegram-feed'
import { listPersistedTelegramAttachments } from '@/lib/telegram/attachment-persist'
import { listOpenTelegramFileJobs } from '@/lib/telegram/file-jobs'
import { getRecentTelegramMedia } from '@/lib/telegram/recent-media'

/** @deprecated use buildTelegramChatMemoryAr — kept for call-site compatibility */
export async function buildTelegramGroupChatMemoryAr(opts: {
  scopeId: string
  chatId: string
  feedLimit?: number
}): Promise<string> {
  return buildTelegramChatMemoryAr(opts)
}

export async function buildTelegramChatMemoryAr(opts: {
  scopeId: string
  chatId: string
  /** Max mirrored feed lines (oldest→newest in the block). */
  feedLimit?: number
}): Promise<string> {
  const feedLimit = Math.min(Math.max(opts.feedLimit ?? 48, 8), 80)
  const [feed, openJobs, atts] = await Promise.all([
    listTelegramFeed(opts.scopeId, feedLimit, {
      externalId: opts.chatId,
    }).catch(() => ({
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

  const recentMem = getRecentTelegramMedia(opts.chatId, 4)

  const lines: string[] = [
    '## ذاكرة محادثة تيليجرام (هذه المحادثة فقط — خاص أو مجموعة)',
    'إلزامي: اقرأ السجل أدناه قبل الرد. نفّذ الطلبات المعلّقة. لا تنسَ ما قيل سابقاً في نفس الشات.',
    'رد موجز بعد التنفيذ — بلا شرح مطوّل وبلا طلب توضيح لطلب واضح/اختصار.',
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
    lines.push(
      '',
      '### سجل المحادثة',
      '- (لا مرآة بعد لهذه المحادثة — اعتمد الرسالة الحالية + المهام/المرفقات أدناه)'
    )
  }

  if (openJobs.length) {
    lines.push('', '### مهام ملفات معلّقة (أولوية تنفيذ)')
    for (const j of openJobs) {
      const params = (() => {
        if (typeof j.workParams.afterPage !== 'number') return ''
        if (j.workParams.findEmptyPage === true) {
          return ` · pdf_duplicate_page findEmptyPage=true afterPage=${j.workParams.afterPage}`
        }
        if (typeof j.workParams.copyPage === 'number') {
          return ` · pdf_duplicate_page copyPage=${j.workParams.copyPage} afterPage=${j.workParams.afterPage}`
        }
        return ''
      })()
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

  if (recentMem.length || atts.length) {
    lines.push('', '### مرفقات تيليجرام الأخيرة (نسخة العمل — ليست Drive بالضرورة)')
    for (const m of recentMem) {
      lines.push(
        `- ذاكرة حيّة: «${m.name}» fileId=${m.fileId} · ${m.mimeType}`
      )
    }
    for (const a of atts.slice(0, 8)) {
      if (/أحياء|احياء|biology/i.test(a.fileName)) continue
      if (recentMem.some((m) => m.fileId === a.vaultFileId)) continue
      lines.push(
        `- مرآة: «${a.fileName}» · ${a.hasBytes ? 'بايتات جاهزة' : 'بيانات فقط'}${
          a.vaultFileId ? ` · fileId=${a.vaultFileId}` : ''
        } · ${a.sizeBytes ? `≈${(a.sizeBytes / (1024 * 1024)).toFixed(1)}م.ب` : ''}`
      )
    }
  }

  lines.push(
    '',
    'قواعد ذاكرة:',
    '• لا تطلب إعادة إرسال إن وُجد fileId/بايتات/مهمة معلّقة.',
    '• تعديل مرفق تيليجرام المرسل حديثاً: عدّل fileId مباشرة ثم return_file — ممنوع استبدال بملف Drive بالتشابه.',
    '• إنشاء ملف من الصفر (صوت/نص): write_file أو brain_create_document أو pdf_create ثم return_file — لا تبحث Drive أولاً.',
    '• موقع/خريطة: geocode ثم أعد روابط الخرائط من نتيجة الأداة.',
    '• بحث جوجل/ويب: web_search (DDG مجاني) فوراً.',
    '• إن وُجدت مهمة «صفحة فاضية» نفّذ pdf_duplicate_page مع findEmptyPage=true — متن فارغ مع ترويسة/شعار مقبول؛ ممنوع بسم الله/ص2 وممنوع copyPage=48 وممنوع صفحة بيضاء مخترعة.'
  )
  return lines.join('\n')
}
