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
  'list_workspace_files',
  'read_document',
  'query_db_readonly',
  'memory_search',
  'search_knowledge_base',
  'ingest_knowledge',
  'calendar_list_events',
  'calendar_scan_email',
  'calendar_find_duplicates',
  'calendar_find_alignment',
  'arabic_ocr',
  'room_calendar_list',
])

const HIGH_RISK_TOOLS = new Set([
  'write_file',
  'delete_file',
  'edit_document',
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
  'browser_rpa',
  'trigger_workflow',
  'room_calendar_create',
  'room_calendar_update',
  'room_calendar_cancel',
  'room_calendar_ingest',
])

export function evaluateActionRisk(
  toolName: string,
  params: Record<string, unknown>,
  mode: SecurityPostureMode
): ActionRiskResult {
  if (TEXT_GENERATION_TOOLS.has(toolName)) {
    return { riskLevel: 'LOW', requiresApproval: false }
  }

  // New edited copies are additive (safe); overwriting the source needs HITL.
  if (toolName === 'edit_document' && !params.replaceSource) {
    if (mode === 'STRICT') {
      return { riskLevel: 'LOW', requiresApproval: true }
    }
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
