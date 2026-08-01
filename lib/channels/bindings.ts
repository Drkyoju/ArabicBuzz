import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import type { ActiveScopeContext } from '@/lib/scopes/types'
import { prisma, withPrismaFallback } from '@/lib/db'

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
    if (opts.externalId === 'demo-shared') {
      return resolveActiveScope({
        userId: opts.fallbackUserId || 'user-1',
        scopeId: 'shared-demo',
        scopes: DEMO_SCOPES,
      })
    }
    return null
  }

  return resolveActiveScope({
    userId: binding.userId || opts.fallbackUserId || 'user-1',
    scopeId: binding.scopeId,
    scopes: DEMO_SCOPES,
  })
}
