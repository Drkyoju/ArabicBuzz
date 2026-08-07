/**
 * Core skill pack — auto-injected into room / assistant / Telegram prompts
 * without requiring marketplace install or per-room picking.
 *
 * Sources adapted (MIT / free GitHub) into ArabicBuzz OpenClaw SKILL.md format:
 * - email triage patterns: alirezarezvani/claude-skills (inbox-triage), googleworkspace/cli (gws-gmail-triage)
 * - research citations: mattpocock/skills (research)
 * - meeting notes: claude-office-skills/skills (meeting-notes)
 * - Arabic office writing: itady74/ux-writing-arabic + sultanalsafran arabic-presentations principles
 * - calendar / daily ops / knowledge: in-repo KSA marketplace pack
 * - OCR / Excel / PDF forms: yejinlei pdf-ocr, anthropics xlsx, claude-office-skills pdf-form-filler
 * - agenda / follow-up / board pack: zapier/wade-skills + decision-board patterns
 * - Drive organize: googleworkspace/cli recipe-organize-drive-folder + file-naming
 * - volunteers / formal letters / KSA deadlines: association ops adaptations
 * - Word/PDF ops: anthropics/skills docx+pdf
 * - email→task / attachments: googleworkspace gws-workflow-email-to-task + recipe-save-email-attachments
 * - presentations: sultanalsafran/agent-skills arabic-presentations
 * - gov research: mattpocock research + free web_search path
 * - contracts: claude-office-skills contract-review → arabic_contract_review
 * - bookkeeping: free bookkeeping patterns → association_bookkeeping_lite (NGO MSA)
 * - NCNP governance + WhatsApp drafting: in-repo association ops
 */

export const CORE_AUTO_SKILL_IDS = [
  'arabic_report_generator',
  'email_inbox_triage',
  'calendar_booking_assistant',
  'meeting_minutes_summary',
  'arabic_office_writer',
  'research_with_sources',
  'telegram_ops_notifier',
  'daily_ops_checklist',
  'knowledge_doc_reviewer',
  // Wave 2 — Gulf / association ops (auto-injected)
  'document_ocr_workflow',
  'excel_ops_reporting',
  'pdf_form_assistant',
  'board_decision_pack',
  'volunteer_coordinator',
  'arabic_formal_letter',
  'followup_crm_lite',
  'agenda_builder',
  'ksa_compliance_deadlines',
  'drive_file_organizer',
  // Wave 3 — docs / email ops / HITL / research (auto-injected)
  'word_docx_assistant',
  'email_to_task',
  'email_attachment_filing',
  'hitl_approvals_queue',
  'arabic_presentation_builder',
  'gov_web_research',
  'pdf_document_ops',
  'calendar_email_ingest',
  // Wave 4 — contracts / NGO books / NCNP / WhatsApp drafting
  'arabic_contract_review',
  'association_bookkeeping_lite',
  'ncnp_governance_auditor',
  'whatsapp_ops_drafter',
] as const

export type CoreAutoSkillId = (typeof CORE_AUTO_SKILL_IDS)[number]

export function isCoreAutoSkill(id: string): boolean {
  return (CORE_AUTO_SKILL_IDS as readonly string[]).includes(id)
}

/** Default allowedSkills for new shared rooms (core pack + light KSA compliance). */
export const DEFAULT_ROOM_SKILL_IDS: string[] = [
  ...CORE_AUTO_SKILL_IDS,
  'zatca_e_invoicing_checker',
  'cron_digest',
  'channel_notify',
]
