import { NextRequest, NextResponse } from 'next/server'
import { prisma, withPrismaFallback } from '@/lib/db'
import { getMemoryAuditLogs } from '@/lib/audit/logger'
import { getUserFromRequest, isSyntheticUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function authorizeSecret(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const secret =
    process.env.AUDIT_EXPORT_SECRET ||
    process.env.CRON_SECRET ||
    ''
  if (!secret || secret === 'change-me') return false
  return header === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  const secretOk = authorizeSecret(req)
  const sessionOk = Boolean(user && !isSyntheticUser(user))
  if (!secretOk && !sessionOk) {
    return NextResponse.json(
      { error: 'يلزم تسجيل الدخول أو مفتاح تصدير التدقيق' },
      { status: 401 }
    )
  }

  const scopeId = req.nextUrl.searchParams.get('scopeId') || undefined
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const format = req.nextUrl.searchParams.get('format') || 'json'

  const dbLogs = await withPrismaFallback(
    () =>
      prisma.sdaiaAuditLog.findMany({
        where: {
          scopeId: scopeId || undefined,
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    []
  )

  const logs = dbLogs.length
    ? dbLogs.map((l) => ({
        id: l.id,
        timestamp: l.createdAt.toISOString(),
        scopeId: l.scopeId,
        userId: l.userId,
        modelUsed: l.modelUsed,
        promptHash: l.promptHash,
        responseHash: l.responseHash,
        riskTier: l.riskTier,
        approvedBy: l.approvedBy,
        dataLocality: l.dataLocality,
        watermarkSignature: l.watermarkSignature,
      }))
    : getMemoryAuditLogs().filter(
        (l) => !scopeId || l.scopeId === scopeId
      )

  if (format === 'csv') {
    const header =
      'id,timestamp,scopeId,userId,modelUsed,riskTier,dataLocality,watermarkSignature,approvedBy,promptHash,responseHash'
    const rows = logs.map((l) =>
      [
        l.id,
        l.timestamp,
        l.scopeId,
        l.userId,
        l.modelUsed,
        l.riskTier,
        l.dataLocality,
        l.watermarkSignature,
        l.approvedBy || '',
        l.promptHash,
        l.responseHash,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = `\uFEFF${header}\n${rows.join('\n')}`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-export.csv"',
      },
    })
  }

  return NextResponse.json({ logs, count: logs.length })
}
