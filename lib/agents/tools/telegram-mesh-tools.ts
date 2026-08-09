/**
 * Telegram storage-mesh + group archive tools for agents (@alhuda14bot).
 * Free paths only — Drive / TG mirror / room / Mac. Never ask to resend.
 */
import { archiveTelegramGroupToDrive } from '@/lib/telegram/group-archive'
import { findAcrossStorageMesh } from '@/lib/telegram/storage-mesh'

export async function executeFindStorageMesh(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo').trim()
  const queryName = String(
    params.queryName || params.name || params.fileName || ''
  ).trim()
  if (!queryName) {
    return {
      ok: false,
      messageAr:
        'يلزم اسم الملف للبحث في الشبكة (Drive → تيليجرام → غرفة → ماك).',
    }
  }
  const chatId = params.chatId ? String(params.chatId).trim() : undefined
  const hydrateBytes = params.hydrateBytes !== false
  const hit = await findAcrossStorageMesh({
    scopeId,
    chatId,
    queryName,
    hydrateBytes,
  })
  if (!hit) {
    return {
      ok: false,
      found: false,
      queryName,
      orderAr: 'Drive → مرآة تيليجرام → غرفة الفريق → جسر الماك',
      messageAr: [
        `لم يُعثر على «${queryName}» في الشبكة.`,
        'لا تطلب إعادة الإرسال إن وُجدت مهمة معلّقة — اتركها في الطابور الصامت أو ارفع للغرفة/Drive بنفس الاسم مرة واحدة.',
      ].join(' '),
    }
  }
  return {
    ok: true,
    found: true,
    source: hit.source,
    fileName: hit.fileName,
    vaultFileId: hit.vaultFileId,
    telegramFileId: hit.telegramFileId,
    driveFileId: hit.driveFileId,
    mimeType: hit.mimeType,
    sizeBytes: hit.sizeBytes,
    hasBuffer: Boolean(hit.buffer?.length),
    orderAr: 'Drive → مرآة تيليجرام → غرفة الفريق → جسر الماك',
    messageAr: `وُجد «${hit.fileName}» عبر ${hit.source} — أكمل العمل (قراءة/تعديل/return_file) بدون طلب إعادة إرسال.`,
  }
}

export async function executeArchiveTelegramGroup(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo').trim()
  const chatId = params.chatId ? String(params.chatId).trim() : undefined
  // Default skip deep history on agent turns (timeout-friendly); opt-in via skipDeepHistory=false
  const skipDeepHistory = params.skipDeepHistory !== false
  const result = await archiveTelegramGroupToDrive({
    chatId,
    scopeId,
    syncRoom: params.syncRoom !== false,
    syncMac: params.syncMac !== false,
    skipDeepHistory,
    attachmentLimit:
      typeof params.attachmentLimit === 'number'
        ? params.attachmentLimit
        : undefined,
  })
  return {
    ok: true,
    chatId: result.chatId,
    scopeId: result.scopeId,
    attachmentsSeen: result.attachmentsSeen,
    downloaded: result.downloaded,
    pushedToDrive: result.pushedToDrive,
    roomSynced: result.roomSynced,
    macSynced: result.macSynced,
    failedCount: result.failed.length,
    skippedDeepHistory: skipDeepHistory,
    limitationAr: result.limitationAr,
    messageAr: result.messageAr,
  }
}
