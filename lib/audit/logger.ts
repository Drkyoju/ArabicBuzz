import { createHmac, randomUUID } from 'crypto'
import { prisma, withPrismaFallback } from '@/lib/db'
import type { SDAIAAuditRecord } from '@/lib/audit/provenance'

const memoryLogs: SDAIAAuditRecord[] = []

function sign(promptHash: string, responseHash: string): string {
  const secret = process.env.SDAIA_AUDIT_HMAC_SECRET || 'dev-secret'
  return createHmac('sha256', secret)
    .update(`${promptHash}|${responseHash}`)
    .digest('hex')
}

export function getMemoryAuditLogs() {
  return [...memoryLogs]
}

export async function logSDAIAEvent(
  record: Omit<SDAIAAuditRecord, 'id' | 'timestamp' | 'watermarkSignature'>
): Promise<string> {
  const id = randomUUID()
  const timestamp = new Date().toISOString()
  const watermarkSignature = sign(record.promptHash, record.responseHash)
  const full: SDAIAAuditRecord = {
    ...record,
    id,
    timestamp,
    watermarkSignature,
  }
  memoryLogs.unshift(full)

  await withPrismaFallback(async () => {
    await prisma.sdaiaAuditLog.create({
      data: {
        id,
        scopeId: record.scopeId,
        userId: record.userId,
        modelUsed: record.modelUsed,
        promptHash: record.promptHash,
        responseHash: record.responseHash,
        riskTier: record.riskTier,
        approvedBy: record.approvedBy,
        dataLocality: record.dataLocality,
        watermarkSignature,
        createdAt: new Date(timestamp),
      },
    })
    return null
  }, null)

  return id
}
