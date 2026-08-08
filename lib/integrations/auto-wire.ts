/**
 * Auto-wire integrations from env + DB — no user «connect» clicks.
 * OAuth (Google once) and IMAP password remain the only one-time credentials.
 */
import { appBaseUrl } from '@/lib/app-url'
import { getWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'
import { resolveChannelOwnerUserIdAsync } from '@/lib/channels/owner-context'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { telegramBotApiFetch } from '@/lib/telegram/never-delete'

export type WireLane = {
  id: 'telegram' | 'mail' | 'google' | 'calendar' | 'drive'
  labelAr: string
  /** يعمل تلقائياً من الإعدادات المخزّنة */
  ok: boolean
  /** يحتاج إدخال مرة واحدة فقط (كلمة مرور / OAuth) */
  needsOnce: boolean
  statusAr: string
  detailAr?: string
}

export type WorkspaceReadiness = {
  ready: boolean
  messageAr: string
  lanes: WireLane[]
  telegramWebhookOk: boolean
  googleEmail: string | null
  imapConfigured: boolean
  autoSyncHintAr: string
}

/** Ensure Telegram webhook points at live Netlify (idempotent). */
export async function ensureTelegramWebhook(): Promise<{
  ok: boolean
  url: string | null
  statusAr: string
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    return {
      ok: false,
      url: null,
      statusAr: 'البوت غير مضبوط على الاستضافة',
    }
  }

  const url =
    process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
    `${appBaseUrl().replace(/\/+$/, '')}/api/webhooks/telegram`
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()

  try {
    const infoRes = await telegramBotApiFetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
      { signal: AbortSignal.timeout(8_000) }
    )
    const info = (await infoRes.json()) as {
      ok?: boolean
      result?: { url?: string; last_error_message?: string }
    }
    const current = info.result?.url || ''
    const alreadyOk =
      Boolean(current) &&
      current.replace(/\/+$/, '') === url.replace(/\/+$/, '') &&
      !info.result?.last_error_message

    if (!alreadyOk) {
      const body: Record<string, unknown> = {
        url,
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        drop_pending_updates: false,
      }
      if (secret) body.secret_token = secret
      const setRes = await telegramBotApiFetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        }
      )
      const setJson = (await setRes.json()) as {
        ok?: boolean
        description?: string
      }
      if (!setJson.ok) {
        return {
          ok: false,
          url,
          statusAr: setJson.description || 'تعذّر تثبيت الويب هوك',
        }
      }
    }

    return {
      ok: true,
      url,
      statusAr: 'مربوط · الويب هوك يعمل تلقائياً',
    }
  } catch (e) {
    return {
      ok: false,
      url,
      statusAr:
        e instanceof Error ? e.message : 'تعذّر التحقق من ويب هوك تيليجرام',
    }
  }
}

async function findOwnerGoogleRow(): Promise<{
  userId: string
  email: string | null
} | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null

  const ownerUserId =
    process.env.BRAIN_OWNER_USER_ID?.trim() ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    ''

  if (ownerUserId) {
    const { data } = await sb
      .from('google_oauth_tokens')
      .select('user_id, email, updated_at')
      .eq('user_id', ownerUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.user_id) {
      return {
        userId: String(data.user_id),
        email: data.email ? String(data.email) : null,
      }
    }
  }

  const { data: byEmail } = await sb
    .from('google_oauth_tokens')
    .select('user_id, email, updated_at')
    .ilike('email', getWorkspaceOwnerEmail())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byEmail?.user_id) {
    return {
      userId: String(byEmail.user_id),
      email: byEmail.email ? String(byEmail.email) : null,
    }
  }

  const { data: latest } = await sb
    .from('google_oauth_tokens')
    .select('user_id, email, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest?.user_id) {
    return {
      userId: String(latest.user_id),
      email: latest.email ? String(latest.email) : null,
    }
  }
  return null
}

/**
 * Snapshot: what is already wired from env/DB vs what still needs one credential.
 */
export async function getWorkspaceReadiness(): Promise<WorkspaceReadiness> {
  const webhook = await ensureTelegramWebhook()
  const telegramToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim())
  const telegramOwner = await hasTelegramOwnerTarget()
  const telegramOk =
    telegramToken && webhook.ok && (telegramOwner || Boolean(process.env.TELEGRAM_TEST_CHAT_ID?.trim()))

  let imapConfigured = false
  try {
    const { isImapConfigured } = await import('@/lib/email/imap-store')
    imapConfigured = await isImapConfigured()
  } catch {
    imapConfigured = false
  }

  const googleRow = await findOwnerGoogleRow()
  let googleTokenFresh = false
  if (googleRow) {
    try {
      const { getValidGoogleAccessToken } = await import('@/lib/google/tokens')
      const tok = await getValidGoogleAccessToken(googleRow.userId, googleRow.email)
      googleTokenFresh = tok.ok
      if (tok.ok && tok.email) googleRow.email = tok.email
    } catch {
      googleTokenFresh = Boolean(googleRow.email)
    }
  }

  // Prefer owner user id for channel tools even when tokens missing.
  void resolveChannelOwnerUserIdAsync(googleRow?.userId)

  const lanes: WireLane[] = [
    {
      id: 'telegram',
      labelAr: 'تيليجرام',
      ok: telegramOk,
      needsOnce: telegramToken && !telegramOwner,
      statusAr: !telegramToken
        ? 'يحتاج إعداد من المسؤول على الاستضافة'
        : telegramOk
          ? 'يعمل'
          : webhook.ok
            ? 'البوت جاهز · بانتظار محادثة مربوطة'
            : webhook.statusAr,
      detailAr:
        'يربط التنبيهات والغرف والجوال بنفس سياق العمل تلقائياً.',
    },
    {
      id: 'mail',
      labelAr: 'بريد الجمعية',
      ok: imapConfigured,
      needsOnce: !imapConfigured,
      statusAr: imapConfigured
        ? 'يعمل · مزامنة تلقائية'
        : 'يحتاج كلمة مرور info@ مرة واحدة',
      detailAr:
        'صندوق الوارد والردود تُزامَن للغرفة والمساعدين دون أزرار ربط.',
    },
    {
      id: 'google',
      labelAr: 'Google (تقويم / Drive)',
      ok: googleTokenFresh,
      needsOnce: !googleTokenFresh,
      statusAr: googleTokenFresh
        ? `يعمل${googleRow?.email ? ` · ${googleRow.email}` : ''}`
        : 'يحتاج تسجيل دخول Google مرة واحدة للحساب المالك',
      detailAr:
        'بعد أول دخول تُستخدم التوكنات تلقائياً للتقويم والعقل والتحويل.',
    },
    {
      id: 'calendar',
      labelAr: 'التقويم',
      ok: true, // room calendar always works; Google is optional boost
      needsOnce: false,
      statusAr: googleTokenFresh
        ? 'يعمل · غرفة + Google'
        : 'يعمل · تقويم الغرفة (Google اختياري)',
      detailAr: 'مواعيد الغرفة مشتركة دائماً؛ Google يوسّع المزامنة الخارجية.',
    },
    {
      id: 'drive',
      labelAr: 'عقل Drive',
      ok: googleTokenFresh,
      needsOnce: !googleTokenFresh,
      statusAr: googleTokenFresh
        ? 'يعمل · فهرسة دورية تلقائية'
        : 'ينتظر توكن Google للمالك',
      detailAr: 'الملفات تُفهرس بالخلفية دون زر «زامن».',
    },
  ]

  // «جاهزة» = telegram wired + mail OR google for day-to-day ops
  const coreOk =
    telegramToken &&
    webhook.ok &&
    (imapConfigured || googleTokenFresh)

  const missing: string[] = []
  if (!telegramToken) missing.push('تيليجرام على الاستضافة')
  else if (!telegramOwner && !process.env.TELEGRAM_TEST_CHAT_ID?.trim()) {
    missing.push('محادثة تيليجرام (مرة واحدة عبر /start)')
  }
  if (!imapConfigured && !googleTokenFresh) {
    missing.push('كلمة مرور بريد info@')
  } else if (!imapConfigured) {
    missing.push('كلمة مرور بريد info@ (موصى بها)')
  }

  const messageAr = coreOk
    ? 'مساحتك جاهزة — البريد والتقويم وتيليجرام والمعرفة تتزامن تلقائياً.'
    : missing.length
      ? `يحتاج إعداداً مرة واحدة: ${missing.slice(0, 2).join(' · ')}`
      : 'جاري ربط الخدمات…'

  return {
    ready: coreOk,
    messageAr,
    lanes,
    telegramWebhookOk: webhook.ok,
    googleEmail: googleRow?.email || null,
    imapConfigured,
    autoSyncHintAr:
      'المزامنة تعمل بالخلفية (بريد · تقويم · عقل Drive · تيليجرام) دون أزرار ربط.',
  }
}

/** Run quiet background syncs when credentials already exist. */
export async function runAutoSyncPass(opts?: {
  maxMail?: number
  maxDriveFiles?: number
}): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}

  out.telegramWebhook = await ensureTelegramWebhook()

  try {
    const { isImapConfigured } = await import('@/lib/email/imap-store')
    if (await isImapConfigured()) {
      const { syncImapInbox } = await import('@/lib/email/imap-sync')
      out.imap = await syncImapInbox({
        maxMessages: opts?.maxMail ?? 40,
        notifyTelegram: true,
      })
    } else {
      out.imap = { skipped: true, reason: 'imap_not_configured' }
    }
  } catch (e) {
    out.imap = {
      ok: false,
      error: e instanceof Error ? e.message : 'imap error',
    }
  }

  try {
    const { syncAllOptedInGoogleToRooms } = await import(
      '@/lib/rooms/room-calendar-google-sync'
    )
    out.calendar = await syncAllOptedInGoogleToRooms()
  } catch (e) {
    out.calendar = {
      ok: false,
      error: e instanceof Error ? e.message : 'calendar sync error',
    }
  }

  try {
    const googleRow = await findOwnerGoogleRow()
    if (googleRow) {
      const { syncDriveFolderToBrain } = await import('@/lib/google/drive-brain')
      const {
        COMPANY_BRAIN_SCOPE_ID,
        getDriveBrainFolderId,
      } = await import('@/lib/google/drive')
      out.drive = await syncDriveFolderToBrain({
        userId: googleRow.userId,
        scopeId: COMPANY_BRAIN_SCOPE_ID,
        folderId: getDriveBrainFolderId(),
        maxFiles: opts?.maxDriveFiles ?? 4,
        force: false,
      })
    } else {
      out.drive = { skipped: true, reason: 'no_google_tokens' }
    }
  } catch (e) {
    out.drive = {
      ok: false,
      error: e instanceof Error ? e.message : 'drive sync error',
    }
  }

  return out
}

/** Guess IMAP/SMTP host from email domain (one-shot form helper). */
export function guessMailHosts(email: string): {
  imapHost: string
  smtpHost: string
} {
  const domain = email.split('@')[1]?.trim().toLowerCase() || ''
  if (!domain) return { imapHost: '', smtpHost: '' }
  const host = `mail.${domain}`
  return { imapHost: host, smtpHost: host }
}
