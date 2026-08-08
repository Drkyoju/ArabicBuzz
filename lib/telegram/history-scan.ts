/**
 * Deep Telegram group history recovery (free path).
 *
 * Bot API / Local Bot API / bot-token MTProto CANNOT read ancient messages.
 * User MTProto (Telethon) on Mac via MAC_SYNC can — when
 * TELEGRAM_API_ID + TELEGRAM_API_HASH + TELEGRAM_SESSION_STRING are set.
 *
 * Never spam Telegram chat about missing credentials; cron retries silently.
 */
import {
  isBiologyTeacherGuideName,
  matchMuallimSeerahFile,
} from '@/lib/files/muallim-seerah-match'
import { telegramLargeFilePathStatus } from '@/lib/telegram/large-file-download'

export type DeepHistoryStatus = {
  localBotApiConfigured: boolean
  macHopConfigured: boolean
  mtprotoEnvPresent: boolean
  credentialsReady: boolean
  setupAr: string
  limitationAr: string
  freePathAr: string
}

export type DeepHistoryScanResult = {
  ok: boolean
  credentialsReady: boolean
  source?: string
  scanned?: number
  downloaded?: number
  ingested?: number
  muallimFound?: boolean
  muallimVaultFileId?: string
  muallimFileName?: string
  nextOffsetId?: number
  errorAr?: string
  setupAr?: string
  files?: Array<{ fileName: string; messageId?: number; path?: string }>
}

const DEFAULT_CHAT = '-1003855925966'
const DEFAULT_SCOPE = 'shared-demo'

/** In-memory cursor so cron advances without spamming. */
const scanCursorByChat = new Map<string, number>()

export function getDeepHistoryStatus(): DeepHistoryStatus {
  const lf = telegramLargeFilePathStatus()
  const mtprotoEnvPresent = lf.mtprotoEnvPresent
  return {
    localBotApiConfigured: lf.localBotApiConfigured,
    macHopConfigured: lf.macHopConfigured,
    mtprotoEnvPresent,
    credentialsReady: mtprotoEnvPresent && lf.macHopConfigured,
    setupAr: [
      'لاستعادة ملفات المجموعة القديمة (قبل وصول البوت): مرة واحدة على الماك',
      '1) https://my.telegram.org → TELEGRAM_API_ID + TELEGRAM_API_HASH',
      '2) npm run telegram:mtproto-login (حساب عضو في «عمل الجمعية» — بلا رسالة للمجموعة)',
      '3) أبقِ npm run storage:sync + نفقاً → MAC_SYNC_URL على CranL',
      'الكرون يعيد المحاولة صامتاً حتى تظهر البايتات ثم يكمل المهام.',
    ].join(' '),
    limitationAr:
      'بوت تيليجرام (حتى Local Bot API) لا يقرأ تاريخ الرسائل التي لم يستلمها. المسح العميق يحتاج جلسة مستخدم MTProto على الماك.',
    freePathAr: lf.freePathAr,
  }
}

/**
 * Ask Mac hop to MTProto-scan the group; ingest downloaded files into room+Drive.
 * Prefer muallim seerah PDF; never biology.
 */
export async function scanTelegramGroupDeepHistory(opts?: {
  chatId?: string
  scopeId?: string
  limit?: number
  /** Prefer only معلم اول / معالم / سيرة downloads */
  muallimOnly?: boolean
  nameFilter?: string
  download?: boolean
}): Promise<DeepHistoryScanResult> {
  const chatId = opts?.chatId?.trim() || DEFAULT_CHAT
  const scopeId =
    opts?.scopeId?.trim() ||
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() ||
    DEFAULT_SCOPE
  const status = getDeepHistoryStatus()

  const { macSyncConfigured, getMacSyncConfig } = await import(
    '@/lib/storage/mac-sync-client'
  )
  if (!macSyncConfigured()) {
    return {
      ok: false,
      credentialsReady: false,
      errorAr: 'MAC_SYNC_URL غير مضبوط — لا يمكن تشغيل مسح MTProto من CranL',
      setupAr: status.setupAr,
    }
  }

  const { baseUrl, secret } = getMacSyncConfig()
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (secret) headers.set('Authorization', `Bearer ${secret}`)

  const offsetId = scanCursorByChat.get(chatId) || 0
  let remote: Record<string, unknown>
  try {
    const res = await fetch(`${baseUrl}/telegram/scan-history`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        chatId,
        limit: opts?.limit ?? 200,
        offsetId,
        download: opts?.download !== false,
        muallimOnly: opts?.muallimOnly !== false,
        nameFilter: opts?.nameFilter,
      }),
    })
    remote = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok && remote.ok !== true) {
      return {
        ok: false,
        credentialsReady: Boolean(remote.credentialsReady),
        errorAr: String(
          remote.errorAr || remote.error || `HTTP ${res.status}`
        ).slice(0, 400),
        setupAr: String(remote.setupAr || status.setupAr),
      }
    }
  } catch (e) {
    return {
      ok: false,
      credentialsReady: status.credentialsReady,
      errorAr:
        e instanceof Error
          ? e.message
          : 'تعذّر الاتصال بوكيل الماك لمسح التاريخ',
      setupAr: status.setupAr,
    }
  }

  if (remote.credentialsReady === false || remote.ok === false) {
    return {
      ok: false,
      credentialsReady: false,
      errorAr: String(remote.errorAr || 'جلسة MTProto غير جاهزة'),
      setupAr: String(remote.setupAr || status.setupAr),
    }
  }

  const next = Number(remote.nextOffsetId || 0)
  if (next > 0) scanCursorByChat.set(chatId, next)

  const files = Array.isArray(remote.files)
    ? (remote.files as Array<Record<string, unknown>>)
    : []
  const muallimHits = Array.isArray(remote.muallimHits)
    ? (remote.muallimHits as Array<Record<string, unknown>>)
    : files.filter((f) =>
        matchMuallimSeerahFile(String(f.fileName || f.name || ''))
      )

  let ingested = 0
  let muallimVaultFileId: string | undefined
  let muallimFileName: string | undefined

  const { persistBytesToRoomAndDrive } = await import(
    '@/lib/telegram/storage-mesh'
  )

  const payloads = Array.isArray(remote.payloads)
    ? (remote.payloads as Array<Record<string, unknown>>)
    : []

  const toIngest = [...payloads, ...muallimHits]
  for (const p of toIngest) {
    const b64 = p.contentBase64 ? String(p.contentBase64) : ''
    const fileName = String(p.fileName || p.name || 'telegram.bin')
    if (isBiologyTeacherGuideName(fileName)) continue
    if (!b64) continue
    try {
      const buffer = Buffer.from(b64, 'base64')
      if (!buffer.length) continue
      const saved = await persistBytesToRoomAndDrive({
        scopeId,
        chatId,
        buffer,
        fileName,
        mimeType: String(p.mimeType || 'application/pdf'),
      })
      ingested++
      if (matchMuallimSeerahFile(fileName)) {
        muallimVaultFileId = saved.vaultFileId
        muallimFileName = saved.fileName
      }
    } catch (e) {
      console.warn('[telegram] deep history ingest', fileName, e)
    }
  }

  if (!muallimVaultFileId) {
    try {
      const { findAcrossStorageMesh } = await import(
        '@/lib/telegram/storage-mesh'
      )
      for (const q of [
        'المعلم الاول',
        'المعلم الأول من معالم من السيرة النبوية',
      ]) {
        const hit = await findAcrossStorageMesh({
          scopeId,
          chatId,
          queryName: q,
          hydrateBytes: true,
        })
        if (hit?.buffer?.length && hit.vaultFileId) {
          muallimVaultFileId = hit.vaultFileId
          muallimFileName = hit.fileName
          break
        }
      }
    } catch {
      /* optional */
    }
  }

  return {
    ok: true,
    credentialsReady: true,
    source: String(remote.source || 'mtproto_user'),
    scanned: Number(remote.scanned || 0),
    downloaded: Number(remote.downloaded || 0),
    ingested,
    muallimFound: Boolean(muallimVaultFileId),
    muallimVaultFileId,
    muallimFileName,
    nextOffsetId: next || undefined,
    files: files.slice(0, 40).map((f) => ({
      fileName: String(f.fileName || f.name || ''),
      messageId: f.messageId != null ? Number(f.messageId) : undefined,
      path: f.path ? String(f.path) : undefined,
    })),
  }
}
