import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

let client: PrismaClient | undefined

function getClient(): PrismaClient {
  if (client) return client
  client = globalForPrisma.prisma ?? new PrismaClient({ log: [] })
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  return client
}

// The client is constructed lazily on first use rather than at import time.
// `new PrismaClient()` throws when DATABASE_URL is missing or the generated
// client is out of date, and at import time that crashes the whole route module
// during `next build` page-data collection. Deferring it means the failure
// surfaces inside the query call, where withPrismaFallback can handle it.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getClient()
    const value = Reflect.get(instance, prop, instance)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export async function withPrismaFallback<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}
