import { NextResponse } from 'next/server'
import { prisma, withPrismaFallback } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const logs = await withPrismaFallback(
    () =>
      prisma.cronLog.findMany({
        orderBy: { ranAt: 'desc' },
        take: 50,
      }),
    [
      {
        id: 'demo-1',
        taskId: 'demo',
        taskNameAr: 'نشرة صباحية',
        channel: 'whatsapp',
        recipient: '+966500000000',
        status: 'success',
        details: 'تم الإرسال (تجريبي)',
        ranAt: new Date(),
      },
    ]
  )
  return NextResponse.json({ logs })
}
