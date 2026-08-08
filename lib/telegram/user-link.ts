/**
 * Map Telegram user id ↔ workspace user id for personal Gmail/Drive tokens.
 * Stored as channel_bindings row: channel=telegram, external_id=`u:<tgUserId>`.
 * First-time Google OAuth still requires the website once.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server'
import { prisma, withPrismaFallback } from '@/lib/db'
import { resolveChannelOwnerUserIdAsync } from '@/lib/channels/owner-context'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isWorkspaceUserId(id: string): boolean {
  return UUID_RE.test(String(id || '').trim())
}

function userExternalId(tgUserId: string) {
  return `u:${tgUserId}`
}

/** Env map: "12345:uuid,67890:uuid2" */
function envMapLookup(tgUserId: string): string | null {
  const raw = process.env.TELEGRAM_USER_MAP?.trim()
  if (!raw) return null
  for (const part of raw.split(/[,;]+/)) {
    const [tg, uid] = part.split(':').map((s) => s.trim())
    if (tg === tgUserId && uid && isWorkspaceUserId(uid)) return uid
  }
  return null
}

export async function lookupTelegramWorkspaceUserId(
  tgUserId: string
): Promise<string | null> {
  const id = String(tgUserId || '').trim()
  if (!id || !/^\d+$/.test(id)) return null

  const fromEnv = envMapLookup(id)
  if (fromEnv) return fromEnv

  const externalId = userExternalId(id)

  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('external_id', externalId)
        .maybeSingle()
      const uid = data?.user_id ? String(data.user_id) : ''
      if (uid && isWorkspaceUserId(uid)) return uid
    }
  } catch {
    /* fall through */
  }

  const row = await withPrismaFallback(
    () =>
      prisma.channelBinding.findUnique({
        where: {
          channel_externalId: {
            channel: 'telegram',
            externalId,
          },
        },
      }),
    null
  )
  if (row?.userId && isWorkspaceUserId(row.userId)) return row.userId
  return null
}

/**
 * Prefer personal TG↔workspace link for Gmail/Drive; else channel owner.
 */
export async function resolveTelegramRequesterUserId(
  tgUserId: string
): Promise<{ userId: string; source: 'personal' | 'owner' | 'env_map' }> {
  const personal = await lookupTelegramWorkspaceUserId(tgUserId)
  if (personal) {
    const fromEnv = envMapLookup(String(tgUserId).trim())
    return {
      userId: personal,
      source: fromEnv ? 'env_map' : 'personal',
    }
  }
  const owner = await resolveChannelOwnerUserIdAsync(tgUserId)
  return { userId: owner, source: 'owner' }
}

export async function linkTelegramUserToWorkspace(opts: {
  tgUserId: string
  workspaceUserId: string
  scopeId?: string
}): Promise<{ ok: true } | { ok: false; errorAr: string }> {
  const tgUserId = String(opts.tgUserId || '').trim()
  const workspaceUserId = String(opts.workspaceUserId || '').trim()
  if (!/^\d+$/.test(tgUserId)) {
    return { ok: false, errorAr: 'معرّف تيليجرام غير صالح.' }
  }
  if (!isWorkspaceUserId(workspaceUserId)) {
    return {
      ok: false,
      errorAr:
        'معرّف حساب الموقع غير صالح (يلزم UUID). افتح الإعدادات على الموقع وانسخ معرّف الحساب.',
    }
  }
  const scopeId =
    opts.scopeId?.trim() ||
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() ||
    'shared-demo'
  const externalId = userExternalId(tgUserId)
  const scopeKind = scopeId.startsWith('personal') ? 'personal' : 'shared'

  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data: existing } = await sb
        .from('channel_bindings')
        .select('id')
        .eq('channel', 'telegram')
        .eq('external_id', externalId)
        .maybeSingle()
      if (existing?.id) {
        await sb
          .from('channel_bindings')
          .update({
            scope_id: scopeId,
            scope_kind: scopeKind,
            user_id: workspaceUserId,
          })
          .eq('id', existing.id)
      } else {
        await sb.from('channel_bindings').insert({
          id: crypto.randomUUID(),
          channel: 'telegram',
          external_id: externalId,
          scope_id: scopeId,
          scope_kind: scopeKind,
          user_id: workspaceUserId,
        })
      }
      return { ok: true }
    }
  } catch {
    /* prisma fallback */
  }

  await withPrismaFallback(
    () =>
      prisma.channelBinding.upsert({
        where: {
          channel_externalId: {
            channel: 'telegram',
            externalId,
          },
        },
        create: {
          channel: 'telegram',
          externalId,
          scopeId,
          scopeKind: scopeKind as 'personal' | 'shared',
          userId: workspaceUserId,
        },
        update: {
          scopeId,
          userId: workspaceUserId,
        },
      }),
    null
  )
  return { ok: true }
}
