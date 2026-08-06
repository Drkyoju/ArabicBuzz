import { getSupabaseAdmin } from '@/lib/supabase/server'
import { isNoiseRoomPost } from '@/lib/rooms/noise'
import type { DbRoomPost } from '@/lib/rooms/persist'

export type TelegramFeedSource = 'site' | 'telegram' | 'bot'

export type TelegramFeedItem = {
  id: string
  textAr: string
  source: TelegramFeedSource
  sourceLabelAr: string
  senderAr: string
  atIso: string
  atAr: string
}

const SOURCE_LABEL: Record<TelegramFeedSource, string> = {
  site: 'موقع',
  telegram: 'تيليجرام',
  bot: 'بوت',
}

const TZ = 'Asia/Riyadh'

function fmtAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** Strip legacy outbound wrappers so the home window shows the real text. */
export function unwrapOutboundTelegramContent(content: string): string {
  const c = String(content || '').trim()
  const prefixes = [
    'تم إرسال رسالة للخارج عبر تيليجرام:\n',
    'تعذّر الإرسال عبر تيليجرام (تحقق من مفاتيح القناة). النص:\n',
  ]
  for (const p of prefixes) {
    if (c.startsWith(p)) return c.slice(p.length).trim()
  }
  return c
}

export function classifyTelegramFeedSource(row: {
  author_kind: string
  author_id: string
  author_name_ar: string
}): TelegramFeedSource {
  if (row.author_kind === 'agent') return 'bot'
  if (row.author_kind === 'channel') return 'telegram'
  if (row.author_id === 'outbound' || row.author_kind === 'human') return 'site'
  if (row.author_kind === 'system') {
    if (/وكيل|بوت|رد/i.test(row.author_name_ar)) return 'bot'
    return 'site'
  }
  return 'telegram'
}

function rowToFeedItem(row: DbRoomPost): TelegramFeedItem | null {
  const textAr = unwrapOutboundTelegramContent(row.content)
  if (isNoiseRoomPost(textAr)) return null
  const source = classifyTelegramFeedSource(row)
  return {
    id: row.id,
    textAr,
    source,
    sourceLabelAr: SOURCE_LABEL[source],
    senderAr: row.author_name_ar,
    atIso: row.created_at,
    atAr: fmtAt(row.created_at),
  }
}

/** Recent telegram-mirrored room posts for the home window (newest last). */
export async function listTelegramFeed(
  scopeId: string,
  limit = 40
): Promise<{ ok: boolean; items: TelegramFeedItem[]; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, items: [], error: 'no supabase' }
  const take = Math.min(Math.max(limit, 1), 100)
  const { data, error } = await sb
    .from('room_posts')
    .select('*')
    .eq('scope_id', scopeId)
    .eq('channel', 'telegram')
    .order('created_at', { ascending: false })
    .limit(take)
  if (error) return { ok: false, items: [], error: error.message }
  const items = (data as DbRoomPost[])
    .map(rowToFeedItem)
    .filter((x): x is TelegramFeedItem => Boolean(x))
    .reverse()
  return { ok: true, items }
}

export type TelegramLinkStatus = {
  linked: boolean
  botConfigured: boolean
  hasScopeBinding: boolean
  hasOwnerFallback: boolean
  deepLink: string
  botUrl: string
  hintAr: string
}

/** Whether this room can send/receive via Telegram (binding or owner env). */
export async function getTelegramLinkStatus(
  scopeId: string
): Promise<TelegramLinkStatus> {
  const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim())
  const hasOwnerFallback = Boolean(
    process.env.TELEGRAM_OWNER_CHAT_ID?.trim() ||
      process.env.TELEGRAM_TEST_CHAT_ID?.trim()
  )
  let hasScopeBinding = false
  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('external_id')
        .eq('channel', 'telegram')
        .eq('scope_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      hasScopeBinding = Boolean(data?.external_id)
    }
  } catch {
    hasScopeBinding = false
  }

  const botUrl =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() ||
    'https://t.me/alhuda14bot'
  const deepLink = `${botUrl.replace(/\/$/, '')}?start=scope_${encodeURIComponent(scopeId)}`
  const linked = botConfigured && (hasScopeBinding || hasOwnerFallback)

  let hintAr =
    'اربط هذه المساحة بالبوت عبر الرابط أدناه، ثم أرسل /start من تيليجرام. لا نخترع معرّفات محادثة.'
  if (!botConfigured) {
    hintAr =
      'البوت غير مفعّل بعد — يحتاج المسؤول ضبط TELEGRAM_BOT_TOKEN والويب هوك على الاستضافة.'
  } else if (!linked) {
    hintAr =
      'لا محادثة مربوطة لهذه المساحة. افتح «ربط هذه المساحة» من تيليجرام أو اضبط TELEGRAM_OWNER_CHAT_ID للتنبيهات.'
  }

  return {
    linked,
    botConfigured,
    hasScopeBinding,
    hasOwnerFallback,
    deepLink,
    botUrl,
    hintAr,
  }
}
