export type SecurityPostureMode = 'STRICT' | 'AUTO' | 'DANGEROUS'
export type RiskLevel = 'LOW' | 'HIGH'

export type ActionRiskResult = {
  riskLevel: RiskLevel
  requiresApproval: boolean
}

export const POSTURE_LABELS_AR: Record<SecurityPostureMode, string> = {
  STRICT: 'صارم — موافقة على كل أداة',
  AUTO: 'تلقائي — موافقة للخطر العالي فقط',
  DANGEROUS: 'حر — بدون توقف بين الأدوات (خطير)',
}

export const TEXT_GENERATION_TOOLS = new Set([
  'text_generate',
  'generate_text',
])

const LOW_RISK_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'read_file',
  'list_files',
  'query_db_readonly',
  'memory_search',
  'search_knowledge_base',
  'ingest_knowledge',
  'calendar_list_events',
  'calendar_scan_email',
  'calendar_find_duplicates',
])

const HIGH_RISK_TOOLS = new Set([
  'write_file',
  'delete_file',
  'db_update',
  'db_insert',
  'db_delete',
  'send_message',
  'http_mutate',
  'keychain_write',
  'delete_database',
  'transfer_funds',
  'change_user_roles',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'drive_sync_brain',
])

export function evaluateActionRisk(
  toolName: string,
  _params: Record<string, unknown>,
  mode: SecurityPostureMode
): ActionRiskResult {
  if (TEXT_GENERATION_TOOLS.has(toolName)) {
    return { riskLevel: 'LOW', requiresApproval: false }
  }

  const riskLevel: RiskLevel =
    LOW_RISK_TOOLS.has(toolName) && !HIGH_RISK_TOOLS.has(toolName)
      ? 'LOW'
      : 'HIGH'

  if (mode === 'DANGEROUS') {
    return { riskLevel, requiresApproval: false }
  }

  if (mode === 'STRICT') {
    return { riskLevel, requiresApproval: true }
  }

  return {
    riskLevel,
    requiresApproval: riskLevel === 'HIGH',
  }
}

export function shouldHaltForApproval(result: ActionRiskResult): boolean {
  return result.requiresApproval
}

export function parsePosture(raw?: string | null): SecurityPostureMode {
  const v = (raw || 'AUTO').toUpperCase()
  if (v === 'STRICT' || v === 'DANGEROUS' || v === 'AUTO') return v
  return 'AUTO'
}
