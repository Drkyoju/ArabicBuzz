/**
 * Role-scoped tool surfaces for room agents / web chat / Telegram.
 * Owner keeps admin & destructive tools; employees get useful read+work tools.
 * HITL (posture.ts) still gates deletes and high-risk writes.
 */

import type { Role } from '@/lib/auth/rbac-types'
import { ROLE_RANK } from '@/lib/auth/rbac'
import {
  isWorkspaceOwnerEmail,
  orgRoleForEmail,
} from '@/lib/auth/roles'
import type { ToolSet } from 'ai'

/** Safe reads + association work — always available to MEMBER+. */
export const EMPLOYEE_SAFE_TOOLS = [
  // Web (free)
  'web_search',
  'web_fetch',
  'research_task_tools',
  'ingest_url_to_brain',
  // Vault / knowledge
  'search_knowledge_base',
  'memory_search',
  'list_workspace_files',
  'list_files',
  'read_file',
  'read_document',
  'read_excel',
  'write_file',
  'return_file',
  'brain_open_document',
  'brain_save_document',
  'brain_create_document',
  'convert_document',
  'convert_file',
  'arabic_ocr',
  // Drive read (no full sync / upload)
  'drive_list_files',
  'drive_search_files',
  'drive_get_link',
  // PDF
  'pdf_list_fields',
  'pdf_create',
  'pdf_stamp',
  'pdf_annotate',
  'pdf_merge',
  'pdf_duplicate_page',
  'pdf_insert_blank_page',
  'pdf_fill_form',
  'pdf_replace_text',
  // Office edit (additive copies; replaceSource HITL in STRICT)
  'edit_document',
  'edit_excel',
  'edit_image',
  'generate_image_edit',
  // Mail read (+ sync)
  'mail_sync',
  'mail_search',
  'mail_read',
  'gmail_search',
  'gmail_read',
  'sheets_read',
  'calendar_scan_email',
  // Room collaboration
  'room_search',
  'room_calendar_list',
  'room_calendar_create',
  'room_calendar_update',
  'room_calendar_ingest',
  'room_calendar_reconcile',
  'room_tasks_list',
  'room_tasks_create',
  'room_tasks_update',
  'room_tasks_reconcile',
  'room_memory_list',
  'room_memory_add',
  'owner_morning_brief',
  'list_letter_templates',
  'letter_fill_template',
  'minutes_from_thread',
  'fill_policy_audit',
  'read_decision_document',
  'report_room_attendance',
  // Messaging (HITL where configured)
  'send_message',
  'notify_room_member',
  'send_file',
  'mail_send',
  'gmail_send',
] as const

/** Owner / ADMIN only — never bind for plain MEMBER employees. */
export const OWNER_ONLY_TOOLS = [
  'change_user_roles',
  'transfer_funds',
  'delete_database',
  'db_update',
  'db_insert',
  'db_delete',
  'keychain_write',
  'send_director_digest',
  'drive_sync_brain',
  'drive_upload_file',
  'sheets_write',
  'cua_computer',
  'browser_rpa',
  'trigger_workflow',
  'delete_file',
  'brain_delete_document',
  'room_calendar_cancel',
  'calendar_delete_event',
] as const

export type ToolAccessTier = {
  employeeSafe: readonly string[]
  ownerOnly: readonly string[]
}

export const TOOL_ACCESS_TIERS: ToolAccessTier = {
  employeeSafe: EMPLOYEE_SAFE_TOOLS,
  ownerOnly: OWNER_ONLY_TOOLS,
}

export function isElevatedToolRole(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.ADMIN
}

/**
 * Resolve whether the actor gets the full native set (owner/admin)
 * or the employee-safe allowlist.
 */
export function resolveActorToolMode(opts: {
  email?: string | null
  userId?: string | null
  role?: Role | null
}): 'full' | 'employee' {
  if (isWorkspaceOwnerEmail(opts.email)) return 'full'
  const role =
    opts.role ||
    orgRoleForEmail(opts.email, {
      userId: opts.userId || undefined,
      allowSyntheticOwner: true,
    })
  if (isElevatedToolRole(role)) return 'full'
  return 'employee'
}

/**
 * Filter a ToolSet for the actor.
 * Employees keep the full work surface minus OWNER_ONLY (admin/destructive/desktop).
 * Safe reads (Drive search, mail, calendar, PDF, web, vault) stay available.
 */
export function filterToolsForActor(
  all: ToolSet,
  opts: {
    email?: string | null
    userId?: string | null
    role?: Role | null
  }
): ToolSet {
  const mode = resolveActorToolMode(opts)
  if (mode === 'full') return all

  const ownerBlock = new Set<string>(OWNER_ONLY_TOOLS)
  const out: ToolSet = {}
  for (const name of Object.keys(all)) {
    if (ownerBlock.has(name)) continue
    out[name] = all[name]
  }
  return out
}

/** Arabic blurb for ops / help UI. */
export function toolAccessSummaryAr(mode: 'full' | 'employee'): string {
  if (mode === 'full') {
    return 'صلاحيات كاملة (مالك/مدير): بحث Drive ومزامنة، بريد، تقويم، PDF، خزنة، أدوات إدارية.'
  }
  return 'صلاحيات الموظف: بحث Drive وقراءة بريد وتقويم الغرفة وPDF وخزنة وويب مجاني — دون حذف إداري أو مزامنة Drive كاملة أو سطح المكتب.'
}
