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
