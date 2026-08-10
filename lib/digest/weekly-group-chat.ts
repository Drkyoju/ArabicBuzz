/**
 * Weekly Telegram group chat digest for «عمل الجمعية» (and other bound chats).
 * Stable-fact rollup + weekly narrative — once per Riyadh ISO week, no spam.
 * Distinct from director Thursday digest (decisions/HITL).
 */
import { appBaseUrl } from '@/lib/app-url'
import { listUniqueTelegramDigestTargets } from '@/lib/channels/bindings'
import { claimDigestDayKey } from '@/lib/digest/day-claim'
import { emitNotification } from '@/lib/notifications/emit'
import { addRoomMemory, listRoomMemories } from '@/lib/rooms/room-memory'
import { listTelegramFeed } from '@/lib/rooms/telegram-feed'
import { listOpenTelegramFileJobs } from '@/lib/telegram/file-jobs'

const TZ = 'Asia/Riyadh'

/** Prefix stored in room_memories so chat-memory can surface the last digest. */
export const WEEKLY_CHAT_MEMORY_PREFIX = '[ملخص أسبوعي تيليجرام]'

const STABLE_FACT_RE =
  /(?:اسمي|أنا|أنا اسمي|نفضّل|نفضل|دائماً|دائما|لا تنسَ|لا تنس|تذك[ّر]ر|العنوان|الجوال|الواتساب|البريد|اللجنة|المسؤول|التوقيت|توقيت\s*الرياض|مقر|الفرع|الموعد|الاجتماع)/iu

function riyadhParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/** ISO-like week key in Asia/Riyadh (YYYY-Www) for once-per-week claims. */
export function riyadhIsoWeekKey(now = new Date()): string {
  // Use Riyadh calendar date → UTC noon → ISO week (stable across TZ edges).
  const { ymd } = riyadhParts(now)
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  )
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Thursday 11:00–16:59 Asia/Riyadh — after morning digest, before evening noise. */
export function isWeeklyGroupDigestWindow(now = new Date()): boolean {
  try {
    const { weekday, hour } = riyadhParts(now)
    return weekday === 'Thu' && hour >= 11 && hour <= 16
  } catch {
    return false
  }
}

function extractStableLines(
  items: Array<{ textAr?: string; senderAr?: string }>
): string[] {
  const facts: string[] = []
  for (const item of items) {
    const text = String(item.textAr || '').trim()
    if (!text || text.length < 8 || text.length > 220) continue
    if (!STABLE_FACT_RE.test(text)) continue
    const line = `${item.senderAr || 'عضو'}: ${text.slice(0, 160)}`
    if (!facts.some((f) => f.includes(text.slice(0, 36)))) {
      facts.push(line)
    }
    if (facts.length >= 8) break
  }
  return facts
}

function topicHints(items: Array<{ textAr?: string }>): string[] {
  const bag = new Map<string, number>()
  const stop = new Set([
    'من',
    'في',
    'على',
    'إلى',
    'الى',
    'هذا',
    'هذه',
    'ذلك',
    'التي',
    'الذي',
    'كان',
    'يكون',
    'تم',
    'بعد',
    'قبل',
    'مع',
    'عن',
    'أو',
    'او',
    'لا',
    'نعم',
    'شكرا',
    'شكراً',
  ])
  for (const item of items) {
    const words = String(item.textAr || '')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !stop.has(w))
    for (const w of words.slice(0, 24)) {
      bag.set(w, (bag.get(w) || 0) + 1)
    }
  }
  return [...bag.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w)
}

export async function buildWeeklyGroupChatDigestAr(opts: {
  scopeId: string
  chatId: string
  weekKey?: string
  now?: Date
}): Promise<{ textAr: string; hasContent: boolean; memoryLine: string }> {
  const weekKey = opts.weekKey || riyadhIsoWeekKey(opts.now || new Date())
  const [feed, openJobs] = await Promise.all([
    listTelegramFeed(opts.scopeId, 100, { externalId: opts.chatId }).catch(
      () => ({
        ok: false as const,
        items: [] as Awaited<ReturnType<typeof listTelegramFeed>>['items'],
      })
    ),
    listOpenTelegramFileJobs({
      chatId: opts.chatId,
      scopeId: opts.scopeId,
      limit: 10,
    }).catch(() => []),
  ])

  const items = feed.ok ? feed.items : []
  const human = items.filter((i) => i.source !== 'bot')
  const bot = items.filter((i) => i.source === 'bot')
  const withFiles = items.filter((i) => (i.attachments?.length || 0) > 0)
  const facts = extractStableLines(human)
  const topics = topicHints(human)
  const recentHuman = human.slice(-6)

  const hasContent =
    human.length > 0 ||
    openJobs.length > 0 ||
    facts.length > 0 ||
    withFiles.length > 0

  if (!hasContent) {
    return { textAr: '', hasContent: false, memoryLine: '' }
  }

  const base = appBaseUrl()
  const lines = [
    '📋 ملخص أسبوعي للمجموعة — عمل الجمعية',
    `الأسبوع: ${weekKey} · توقيت السعودية`,
    'تذكير واحد في الأسبوع — بلا تكرار يومي.',
    '',
    '── نشاط المحادثة (آخر مرآة محفوظة) ──',
    `• رسائل أعضاء ≈ ${human.length} · ردود بوت ≈ ${bot.length} · رسائل بمرفقات ≈ ${withFiles.length}`,
  ]

  if (topics.length) {
    lines.push(`• كلمات بارزة: ${topics.join(' · ')}`)
  }
  lines.push('')

  if (facts.length) {
    lines.push('── حقائق ثابتة ظهرت هذا الأسبوع ──')
    for (const f of facts) lines.push(`• ${f}`)
    lines.push('')
  }

  if (openJobs.length) {
    lines.push('── مهام ملفات ما زالت معلّقة ──')
    for (const j of openJobs.slice(0, 6)) {
      lines.push(
        `• #${j.id.slice(0, 8)} · ${j.requestText.slice(0, 120)}${
          j.expectedFilename ? ` · «${j.expectedFilename}»` : ''
        }`
      )
    }
    lines.push('')
  }

  if (recentHuman.length) {
    lines.push('── آخر إشارات من الأعضاء ──')
    for (const item of recentHuman) {
      const text = String(item.textAr || '').trim().slice(0, 140)
      if (!text) continue
      lines.push(`• [${item.atAr}] ${item.senderAr}: ${text}`)
    }
    lines.push('')
  }

  lines.push(`👉 الغرفة: ${base}/`)
  lines.push('— Arabic Buzz · يُحفظ أيضاً في ذاكرة الغرفة للوكيل')

  const textAr = lines.join('\n').slice(0, 3500)
  const memoryLine = [
    WEEKLY_CHAT_MEMORY_PREFIX,
    weekKey,
    `chat=${opts.chatId}`,
    `أعضاء≈${human.length}`,
    facts.length ? `حقائق: ${facts.slice(0, 3).join(' | ')}` : '',
    topics.length ? `موضوعات: ${topics.slice(0, 4).join('، ')}` : '',
    openJobs.length ? `مهام ملفات معلّقة: ${openJobs.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 280)

  return { textAr, hasContent: true, memoryLine }
}

/** Latest weekly digest line stored in room memory (if any). */
export async function loadLatestWeeklyChatMemoryLine(
  scopeId: string
): Promise<string | null> {
  const mems = await listRoomMemories(scopeId).catch(() => [])
  const hit = mems.find((m) =>
    m.content.trim().startsWith(WEEKLY_CHAT_MEMORY_PREFIX)
  )
  return hit?.content.trim() || null
}

export type WeeklyGroupDigestResult = {
  scopeId: string
  chatId: string
  sent: boolean
  skipped?: boolean
  reason?: string
}

export async function sendWeeklyGroupChatDigests(opts?: {
  force?: boolean
  now?: Date
}): Promise<{ results: WeeklyGroupDigestResult[]; windowOk: boolean }> {
  const now = opts?.now || new Date()
  const windowOk = opts?.force || isWeeklyGroupDigestWindow(now)
  if (!windowOk) {
    return { results: [], windowOk: false }
  }

  const weekKey = riyadhIsoWeekKey(now)
  const targets = await listUniqueTelegramDigestTargets()
  const results: WeeklyGroupDigestResult[] = []

  for (const { scopeId, chatId } of targets) {
    const claimKey = `weekly-chat:${weekKey}:${chatId}`
    try {
      const built = await buildWeeklyGroupChatDigestAr({
        scopeId,
        chatId,
        weekKey,
        now,
      })
      if (!built.hasContent) {
        results.push({
          scopeId,
          chatId,
          sent: false,
          skipped: true,
          reason: 'empty',
        })
        continue
      }

      if (!opts?.force) {
        const claimed = await claimDigestDayKey(claimKey)
        if (!claimed) {
          results.push({
            scopeId,
            chatId,
            sent: false,
            skipped: true,
            reason: 'already_sent_this_week',
          })
          continue
        }
      }

      const r = await emitNotification({
        channel: 'telegram',
        textAr: built.textAr,
        to: chatId,
        meta: {
          scopeId,
          kind: 'weekly_group_chat_digest',
          weekKey,
          claimKey,
        },
      })

      if (r.ok && built.memoryLine) {
        await addRoomMemory({
          scopeId,
          content: built.memoryLine,
          createdBy: 'digest',
          createdByAr: 'ملخص أسبوعي تيليجرام',
        }).catch(() => null)
      }

      results.push({
        scopeId,
        chatId,
        sent: r.ok,
        skipped: !r.ok,
        reason: r.ok ? undefined : 'send_failed',
      })
    } catch (e) {
      results.push({
        scopeId,
        chatId,
        sent: false,
        skipped: true,
        reason: e instanceof Error ? e.message : 'error',
      })
    }
  }

  return { results, windowOk: true }
}
