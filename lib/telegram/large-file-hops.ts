/**
 * Live hop probes for large Telegram files (Arabic /status + ops).
 *
 * Failover order (download):
 * 1) TELEGRAM_BOT_API_URL (Local Bot API — Mac OrbStack or always-on VPS)
 * 2) MAC_SYNC_URL /telegram/fetch-file (Mac awake + agent)
 * 3) MTProto on Mac (chatId+messageId; secondary when Bot API miss)
 * 4) Room vault / Drive exact name (resume without Mac)
 *
 * OrbStack on a laptop is NOT 24/7 — Mac must be awake. For permanent large-file
 * getFile, point TELEGRAM_BOT_API_URL at a VPS running deploy/telegram-bot-api.
 */

import { getTelegramLocalBotApiRoot } from '@/lib/telegram/bot-api-root'
import { telegramLargeFilePathStatus } from '@/lib/telegram/large-file-download'

export type HopReach = 'up' | 'down' | 'unset'

export type TelegramLargeFileHopProbe = {
  localBotApi: HopReach
  macSync: HopReach
  mtproto: HopReach
  /** When mac hop is up: LibreOffice / Tesseract from /health */
  macTools?: {
    libreoffice?: boolean
    tesseract?: boolean
  }
  /** Config flags (env present), independent of live reach */
  configured: ReturnType<typeof telegramLargeFilePathStatus>
  linesAr: string[]
}

function hopGlyph(r: HopReach): string {
  if (r === 'up') return '✅'
  if (r === 'down') return '❌'
  return '⚪'
}

function hopLabelAr(r: HopReach, unsetAr: string): string {
  if (r === 'up') return 'متاح'
  if (r === 'down') return 'متوقف الآن'
  return unsetAr
}

async function probeLocalBotApiReach(): Promise<HopReach> {
  const root = getTelegramLocalBotApiRoot()
  if (!root) return 'unset'
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return 'down'
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4_000)
  try {
    const res = await fetch(`${root}/bot${token}/getMe`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    return res.ok ? 'up' : 'down'
  } catch {
    return 'down'
  } finally {
    clearTimeout(t)
  }
}

async function probeMtprotoReach(macReach: HopReach): Promise<HopReach> {
  const cfg = telegramLargeFilePathStatus()
  if (macReach === 'up') {
    try {
      const { getMacSyncConfig } = await import('@/lib/storage/mac-sync-client')
      const { baseUrl, secret } = getMacSyncConfig()
      if (!baseUrl) return cfg.mtprotoEnvPresent ? 'down' : 'unset'
      const headers = new Headers()
      if (secret) headers.set('Authorization', `Bearer ${secret}`)
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5_000)
      try {
        const res = await fetch(`${baseUrl}/telegram/history-status`, {
          headers,
          signal: ctrl.signal,
          cache: 'no-store',
        })
        if (!res.ok) return 'down'
        const j = (await res.json().catch(() => null)) as {
          credentialsReady?: boolean
          mtprotoEnvPresent?: boolean
        } | null
        if (j?.credentialsReady || j?.mtprotoEnvPresent) return 'up'
        return 'unset'
      } finally {
        clearTimeout(t)
      }
    } catch {
      return cfg.mtprotoEnvPresent ? 'down' : 'unset'
    }
  }
  if (cfg.mtprotoEnvPresent) return macReach === 'down' ? 'down' : 'unset'
  return 'unset'
}

/** Arabic lines for /status — which large-file hops are up. */
export function formatTelegramHopStatusLinesAr(
  probe: Pick<
    TelegramLargeFileHopProbe,
    'localBotApi' | 'macSync' | 'mtproto' | 'macTools'
  >
): string[] {
  const anyDown =
    probe.localBotApi === 'down' ||
    probe.macSync === 'down' ||
    probe.mtproto === 'down'
  const tools = probe.macTools
  const toolsLine =
    probe.macSync === 'up' && tools
      ? `${hopGlyph(tools.libreoffice ? 'up' : 'down')} LibreOffice على الماك · ${hopGlyph(tools.tesseract ? 'up' : 'down')} Tesseract ara+eng — للتحويل/OCR من تيليجرام`
      : null
  const lines = [
    'مسار الملفات الكبيرة (مجاني — بدون إعادة إرسال):',
    `${hopGlyph(probe.localBotApi)} Local Bot API (TELEGRAM_BOT_API_URL): ${hopLabelAr(probe.localBotApi, 'غير مضبوط — للتشغيل 24/7 ضع الخادم على VPS دائماً')}`,
    `${hopGlyph(probe.macSync)} جسر الماك (MAC_SYNC_URL): ${hopLabelAr(probe.macSync, 'غير مضبوط')} — يحتاج الماك مستيقظاً + npm run mac-hop:watchdog:force`,
    toolsLine,
    `${hopGlyph(probe.mtproto)} MTProto على الماك: ${hopLabelAr(probe.mtproto, 'غير جاهز (جلسة مستخدم)')} — ثانوي عند توفر chat/message`,
    'دائم بلا ماك: خزنة الغرفة + Drive بنفس الاسم → المهام تُستأنف تلقائياً.',
  ].filter((x): x is string => Boolean(x))
  if (anyDown) {
    lines.push(
      '⚠️ hop متوقف: المهام تبقى في انتظار صامت (لا تُلغى). عند عودة الجسر أو ظهور الملف في الغرفة/Drive أُكمل وأرسل الناتج.'
    )
  }
  if (probe.macSync === 'down' || probe.macSync === 'unset') {
    lines.push(
      'إعادة جسر الماك: npm run mac-hop:watchdog:force (agent + cloudflared + تحديث CranL).'
    )
  }
  if (probe.localBotApi === 'unset' && probe.macSync !== 'up') {
    lines.push(
      'للتشغيل 24/7 بلا ماك: أعدّ Fly/VPS لاحقاً (انظر docs/telegram-always-on-bot-api.md) — لا تنشر مدفوعاً بدون طلب.'
    )
  }
  return lines
}

/**
 * Probe live hop reachability (short timeouts). Safe for /status.
 */
export async function probeTelegramLargeFileHops(): Promise<TelegramLargeFileHopProbe> {
  const configured = telegramLargeFilePathStatus()
  const { macSyncConfigured, macHealth } = await import(
    '@/lib/storage/mac-sync-client'
  )
  const [localBotApi, macHealthRes] = await Promise.all([
    probeLocalBotApiReach(),
    macSyncConfigured()
      ? macHealth()
      : Promise.resolve({ ok: false as const, tools: undefined }),
  ])
  const macSync: HopReach = !macSyncConfigured()
    ? 'unset'
    : macHealthRes.ok
      ? 'up'
      : 'down'
  const macTools =
    macSync === 'up' && macHealthRes.tools
      ? {
          libreoffice: Boolean(macHealthRes.tools.libreoffice),
          tesseract: Boolean(macHealthRes.tools.tesseract),
        }
      : undefined
  const mtproto = await probeMtprotoReach(macSync)
  const probe = {
    localBotApi,
    macSync,
    mtproto,
    macTools,
    configured,
    linesAr: [] as string[],
  }
  probe.linesAr = formatTelegramHopStatusLinesAr(probe)
  return probe
}
