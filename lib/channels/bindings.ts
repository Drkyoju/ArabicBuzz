import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import type { ActiveScopeContext } from '@/lib/scopes/types'
import { prisma, withPrismaFallback } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type ChannelBindingRow = {
  channel: string
  externalId: string
  scopeId: string
  userId?: string | null
}

/** Lookup only — does not auto-create a binding (used for linked-group gates). */
export async function lookupChannelBinding(opts: {
  channel: 'telegram' | 'whatsapp'
  externalId: string
}): Promise<ChannelBindingRow | null> {
  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('channel, external_id, scope_id, user_id')
        .eq('channel', opts.channel)
        .eq('external_id', opts.externalId)
        .maybeSingle()
      if (data?.scope_id) {
        return {
          channel: String(data.channel),
          externalId: String(data.external_id),
          scopeId: String(data.scope_id),
          userId: data.user_id ? String(data.user_id) : null,
        }
      }
    }
  } catch {
    /* fall through */
  }

  const row = await withPrismaFallback(
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
  if (!row) return null
  return {
    channel: row.channel,
    externalId: row.externalId,
    scopeId: row.scopeId,
    userId: row.userId,
  }
}

export async function resolveChannelScope(opts: {
  channel: 'telegram' | 'whatsapp'
  externalId: string
  fallbackUserId?: string
  /** When true (default), create a default binding if none exists. Groups should pass false and use /link. */
  autoBind?: boolean
}): Promise<ActiveScopeContext | null> {
  const binding = await lookupChannelBinding({
    channel: opts.channel,
    externalId: opts.externalId,
  })

  if (!binding) {
    if (opts.autoBind === false) return null
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

export type TelegramDigestTarget = {
  scopeId: string
  chatId: string
}

/**
 * Unique Telegram chats for room digests — one entry per chat_id.
 * Avoids multi-scope fan-out to the same group via TELEGRAM_OWNER_CHAT_ID fallback.
 * User DM bindings (`u:…`) are skipped. If no room bindings exist, falls back to
 * TELEGRAM_OWNER_CHAT_ID / TELEGRAM_TEST_CHAT_ID once.
 */
export async function listUniqueTelegramDigestTargets(): Promise<
  TelegramDigestTarget[]
> {
  const byChat = new Map<string, string>()

  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('scope_id, external_id')
        .eq('channel', 'telegram')
        .limit(80)
      for (const row of data || []) {
        const chatId = String(row.external_id || '').trim()
        const scopeId = String(row.scope_id || '').trim()
        if (!chatId || !scopeId || scopeId.startsWith('personal')) continue
        if (chatId.startsWith('u:')) continue
        if (!byChat.has(chatId)) byChat.set(chatId, scopeId)
      }
    }
  } catch {
    /* fall through */
  }

  if (byChat.size === 0) {
    const rows = await withPrismaFallback(
      () =>
        prisma.channelBinding.findMany({
          where: { channel: 'telegram' },
          take: 80,
          orderBy: { createdAt: 'desc' },
        }),
      [] as Array<{ scopeId: string; externalId: string }>
    )
    for (const row of rows) {
      const chatId = String(row.externalId || '').trim()
      const scopeId = String(row.scopeId || '').trim()
      if (!chatId || !scopeId || scopeId.startsWith('personal')) continue
      if (chatId.startsWith('u:')) continue
      if (!byChat.has(chatId)) byChat.set(chatId, scopeId)
    }
  }

  if (byChat.size === 0) {
    const envChat = (
      process.env.TELEGRAM_OWNER_CHAT_ID ||
      process.env.TELEGRAM_TEST_CHAT_ID ||
      ''
    ).trim()
    if (envChat) {
      byChat.set(
        envChat,
        process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() || 'shared-demo'
      )
    }
  }

  return [...byChat.entries()].map(([chatId, scopeId]) => ({
    chatId,
    scopeId,
  }))
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
