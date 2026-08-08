/**
 * Auto-import Telegram media into the room vault (+ optional Drive brain).
 * Default ON. Disable with TELEGRAM_MEDIA_IMPORT=0 or per-scope settings.
 * Never used for plain text — text stays in the live Telegram pane only.
 */
import { resolveChannelOwnerUserIdAsync } from '@/lib/channels/owner-context'
import { getSupabaseAdmin } from '@/lib/supabase/server'

const SETTINGS_TABLE = 'scope_telegram_settings'

export function isTelegramMediaImportEnvEnabled(): boolean {
  const v = (process.env.TELEGRAM_MEDIA_IMPORT || '1').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no'
}

export async function getTelegramMediaImportEnabled(
  scopeId: string
): Promise<boolean> {
  if (!isTelegramMediaImportEnvEnabled()) return false
  const sb = getSupabaseAdmin()
  if (!sb || !scopeId) return true
  try {
    const { data, error } = await sb
      .from(SETTINGS_TABLE)
      .select('media_import')
      .eq('scope_id', scopeId)
      .maybeSingle()
    if (error) {
      // Table may not exist yet — default ON.
      return true
    }
    if (data && typeof data.media_import === 'boolean') {
      return data.media_import
    }
  } catch {
    /* default ON */
  }
  return true
}

export async function setTelegramMediaImportEnabled(
  scopeId: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'no supabase' }
  try {
    const { error } = await sb.from(SETTINGS_TABLE).upsert(
      {
        scope_id: scopeId,
        media_import: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scope_id' }
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'تعذّر حفظ الإعداد',
    }
  }
}

/**
 * After media is saved to the workspace vault: best-effort Drive brain sync
 * using the channel owner Google account (no interactive OAuth in webhook).
 */
export async function afterTelegramMediaSaved(opts: {
  scopeId: string
  fileId: string
  name: string
  mimeType?: string
}): Promise<{
  imported: boolean
  driveSynced: boolean
  messageAr: string
}> {
  const enabled = await getTelegramMediaImportEnabled(opts.scopeId)
  if (!enabled) {
    return {
      imported: false,
      driveSynced: false,
      messageAr: 'استيراد وسائط تيليجرام معطّل لهذه الغرفة.',
    }
  }

  // Vault save already happened — media is in ملفات الفريق / workspace.
  let driveSynced = false
  try {
    const ownerId = await resolveChannelOwnerUserIdAsync()
    if (ownerId && !opts.scopeId.startsWith('personal-')) {
      const { uploadRoomFileToCompanyBrain } = await import(
        '@/lib/google/drive-brain'
      )
      await uploadRoomFileToCompanyBrain({
        userId: ownerId,
        scopeId: opts.scopeId,
        localFileId: opts.fileId,
      })
      driveSynced = true
    }
  } catch (e) {
    console.error('[telegram] media drive sync', opts.fileId, e)
  }

  return {
    imported: true,
    driveSynced,
    messageAr: driveSynced
      ? `وسائط محفوظة في أرشيف الغرفة ومزامَنة مع عقل الشركة: «${opts.name}».`
      : `وسائط محفوظة في أرشيف الغرفة: «${opts.name}» (جاهزة للتنفيذ من تيليجرام دون انتظار Drive).`,
  }
}
