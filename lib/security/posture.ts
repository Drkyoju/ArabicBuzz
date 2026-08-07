export type SecurityPostureMode = 'STRICT' | 'AUTO' | 'DANGEROUS'
export type RiskLevel = 'LOW' | 'HIGH'

export type ActionRiskResult = {
  riskLevel: RiskLevel
  requiresApproval: boolean
}

export const POSTURE_LABELS_AR: Record<SecurityPostureMode, string> = {
  STRICT: 'صارم — موافقة على كل أداة',
  AUTO: 'تلقائي — موافقة للخطر العالي فقط',
  DANGEROUS: 'حر — تنفيذ فوري بدون موافقات',
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
  'convert_document',
  'brain_open_document',
  'query_db_readonly',
  'memory_search',
  'search_knowledge_base',
  'ingest_knowledge',
  'ingest_url_to_brain',
  'read_decision_document',
  'report_room_attendance',
  'calendar_list_events',
  'calendar_scan_email',
  'calendar_find_duplicates',
  'calendar_find_alignment',
  'gmail_search',
  'gmail_read',
  'sheets_read',
  'arabic_ocr',
  'room_calendar_list',
  'room_tasks_list',
  'room_memory_list',
  'pdf_list_fields',
  'read_excel',
  'return_file',
])

const HIGH_RISK_TOOLS = new Set([
  'write_file',
  'delete_file',
  'edit_document',
  'edit_excel',
  'edit_image',
  'generate_image_edit',
  'brain_save_document',
  'brain_create_document',
  'brain_delete_document',
  'fill_policy_audit',
  'send_director_digest',
  'db_update',
  'db_insert',
  'db_delete',
  'send_message',
  'send_file',
  'http_mutate',
  'keychain_write',
  'delete_database',
  'transfer_funds',
  'change_user_roles',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'sheets_write',
  'gmail_send',
  'drive_sync_brain',
  'browser_rpa',
  'cua_computer',
  'trigger_workflow',
  'room_calendar_create',
  'room_calendar_update',
  'room_calendar_cancel',
  'room_calendar_ingest',
  'room_calendar_reconcile',
  'room_tasks_create',
  'room_tasks_update',
  'room_tasks_reconcile',
  'room_memory_add',
  'pdf_create',
  'pdf_stamp',
  'pdf_merge',
  'pdf_fill_form',
])

export function evaluateActionRisk(
  toolName: string,
  params: Record<string, unknown>,
  mode: SecurityPostureMode
): ActionRiskResult {
  if (TEXT_GENERATION_TOOLS.has(toolName)) {
    return { riskLevel: 'LOW', requiresApproval: false }
  }

  // New edited copies / conversions are additive; overwriting source needs HITL.
  if (
    (toolName === 'edit_document' && !params.replaceSource) ||
    (toolName === 'edit_excel' && !params.replaceSource) ||
    (toolName === 'edit_image' && !params.replaceSource) ||
    (toolName === 'generate_image_edit' && !params.replaceSource) ||
    toolName === 'convert_document' ||
    toolName === 'return_file' ||
    toolName === 'read_excel'
  ) {
    if (mode === 'STRICT') {
      return { riskLevel: 'LOW', requiresApproval: true }
    }
    return { riskLevel: 'LOW', requiresApproval: false }
  }

  // Cua: observation / health is low-risk; input & navigation stay HITL-gated.
  if (toolName === 'cua_computer') {
    const action = String(params.action || params.tool || '').trim()
    const readOnly = new Set([
      'health_report',
      'list_windows',
      'list_apps',
      'check_permissions',
      'get_window_state',
      'get_browser_state',
    ]).has(action)
    if (readOnly) {
      if (mode === 'STRICT') {
        return { riskLevel: 'LOW', requiresApproval: true }
      }
      return { riskLevel: 'LOW', requiresApproval: false }
    }
    if (mode === 'DANGEROUS') {
      return { riskLevel: 'HIGH', requiresApproval: false }
    }
    return { riskLevel: 'HIGH', requiresApproval: true }
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

/**
 * When true (default), tools never pause for HITL.
 * Set HITL_DISABLED=0 on Netlify to re-enable approvals (Telegram path intact).
 */
export function isHitlDisabled(): boolean {
  const v = (process.env.HITL_DISABLED ?? '1').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no'
}

/**
 * When HITL is enabled, default to AUTO (high-risk only) for association safety.
 * Override with DEFAULT_SECURITY_POSTURE=STRICT|DANGEROUS|AUTO.
 */
export function parsePosture(raw?: string | null): SecurityPostureMode {
  if (isHitlDisabled()) return 'DANGEROUS'
  const fallback = (process.env.DEFAULT_SECURITY_POSTURE || 'AUTO').toUpperCase()
  const v = (raw || fallback).toUpperCase()
  if (v === 'STRICT' || v === 'DANGEROUS' || v === 'AUTO') return v
  return 'AUTO'
}
