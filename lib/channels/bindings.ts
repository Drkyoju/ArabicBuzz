import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import type { ActiveScopeContext } from '@/lib/scopes/types'
import { prisma, withPrismaFallback } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function resolveChannelScope(opts: {
  channel: 'telegram' | 'whatsapp'
  externalId: string
  fallbackUserId?: string
}): Promise<ActiveScopeContext | null> {
  const binding = await withPrismaFallback(
    () =>
      prisma.channelBinding.findUnique({
        where: {
          channel_externalId: {
            channel: opts.channel,
            externalId: opts.externalId,
          },
        },
      }),
    null
  )

  if (!binding) {
    const scopeId =
      opts.channel === 'telegram'
        ? process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo'
        : process.env.WHATSAPP_DEFAULT_SCOPE_ID || 'shared-demo'
    void upsertChannelBinding({
      channel: opts.channel,
      externalId: opts.externalId,
      scopeId,
      userId: opts.fallbackUserId,
    })
    return resolveActiveScope({
      userId: opts.fallbackUserId || 'user-1',
      scopeId,
      scopes: DEMO_SCOPES,
    })
  }

  return resolveActiveScope({
    userId: binding.userId || opts.fallbackUserId || 'user-1',
    scopeId: binding.scopeId,
    scopes: DEMO_SCOPES,
  })
}

export async function upsertChannelBinding(opts: {
  channel: 'telegram' | 'whatsapp'
  externalId: string
  scopeId: string
  userId?: string
}) {
  const scopeKind =
    opts.scopeId.startsWith('personal') ? 'personal' : 'shared'

  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data: existing } = await sb
        .from('channel_bindings')
        .select('id')
        .eq('channel', opts.channel)
        .eq('external_id', opts.externalId)
        .maybeSingle()

      if (existing?.id) {
        await sb
          .from('channel_bindings')
          .update({
            scope_id: opts.scopeId,
            scope_kind: scopeKind,
            user_id: opts.userId || null,
          })
          .eq('id', existing.id)
      } else {
        await sb.from('channel_bindings').insert({
          id: randomUUID(),
          channel: opts.channel,
          external_id: opts.externalId,
          scope_id: opts.scopeId,
          scope_kind: scopeKind,
          user_id: opts.userId || null,
        })
      }
      return
    }
  } catch {
    /* fall through */
  }

  await withPrismaFallback(
    () =>
      prisma.channelBinding.upsert({
        where: {
          channel_externalId: {
            channel: opts.channel,
            externalId: opts.externalId,
          },
        },
        create: {
          channel: opts.channel,
          externalId: opts.externalId,
          scopeId: opts.scopeId,
          scopeKind: scopeKind,
          userId: opts.userId,
        },
        update: {
          scopeId: opts.scopeId,
          userId: opts.userId,
        },
      }),
    null
  )
}

/** Latest bound Telegram chat (for owner notifications when env is unset). */
export async function findLatestTelegramChatId(): Promise<string> {
  try {
    const sb = getSupabaseAdmin()
    if (!sb) return ''
    const { data } = await sb
      .from('channel_bindings')
      .select('external_id')
      .eq('channel', 'telegram')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.external_id ? String(data.external_id) : ''
  } catch {
    return ''
  }
}

export async function hasTelegramOwnerTarget(): Promise<boolean> {
  if (
    process.env.TELEGRAM_OWNER_CHAT_ID?.trim() ||
    process.env.TELEGRAM_TEST_CHAT_ID?.trim()
  ) {
    return true
  }
  return Boolean(await findLatestTelegramChatId())
}
