import { createHash } from 'crypto'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { PERMANENTLY_GATED_TOOLS } from '@/lib/security/trust'

export type SDAIARiskTier =
  | 'TIER_1_LOW'
  | 'TIER_2_MEDIUM'
  | 'TIER_3_HIGH'
  | 'TIER_4_CRITICAL'

export interface SDAIAAuditRecord {
  id: string
  timestamp: string
  scopeId: string
  userId: string
  modelUsed: string
  promptHash: string
  responseHash: string
  riskTier: SDAIARiskTier
  approvedBy?: string
  dataLocality: 'KSA_LOCAL' | 'EXTERNAL_CLOUD'
  watermarkSignature: string
}

export function calculatePromptHash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function classifySDAIARisk(
  toolName: string,
  dataTypesUsed: string[]
): SDAIARiskTier {
  const types = new Set(dataTypesUsed.map((t) => t.toLowerCase()))
  if (
    (PERMANENTLY_GATED_TOOLS as readonly string[]).includes(toolName) ||
    types.has('pii_national_id') ||
    types.has('financial_transfer')
  ) {
    return 'TIER_4_CRITICAL'
  }
  if (
    ['write_file', 'db_update', 'db_insert', 'db_delete', 'send_message'].includes(
      toolName
    ) ||
    types.has('personal_data')
  ) {
    return 'TIER_3_HIGH'
  }
  if (['web_fetch', 'web_search'].includes(toolName) || types.has('external_content')) {
    return 'TIER_2_MEDIUM'
  }
  return 'TIER_1_LOW'
}

export function resolveDataLocality(
  modelUsed: string
): 'KSA_LOCAL' | 'EXTERNAL_CLOUD' {
  if (IS_AIR_GAPPED_MODE) return 'KSA_LOCAL'
  if (modelUsed.includes('ollama') || modelUsed.includes('localhost')) {
    return 'KSA_LOCAL'
  }
  return 'EXTERNAL_CLOUD'
}
