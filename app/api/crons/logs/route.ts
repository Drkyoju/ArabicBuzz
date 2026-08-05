import { NextResponse } from 'next/server'
import { prisma, withPrismaFallback } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  // No fabricated rows: an empty log is the honest answer when the DB is absent.
  const logs = await withPrismaFallback(
    () =>
      prisma.cronLog.findMany({
        orderBy: { ranAt: 'desc' },
        take: 50,
      }),
    []
  )
  return NextResponse.json({ logs })
}
