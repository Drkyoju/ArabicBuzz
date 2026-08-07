/**
 * General-purpose Arabic work core (نواة عامة) — not association packaging.
 * Thin presets over the existing agent engine + tool registry.
 */

export type AssistantId =
  | 'inbox-zero'
  | 'daily-brief'
  | 'file-search'
  | 'telegram-captain'
  | 'general'

export type AssistantRequirement = 'none' | 'google' | 'telegram'

export type AssistantDef = {
  id: AssistantId
  nameAr: string
  taglineAr: string
  descriptionAr: string
  /** Outcome-oriented starter the user can edit before «شغّل». */
  starterPromptAr: string
  systemPromptAr: string
  allowedTools: readonly string[]
  /** Honest empty-state when integration missing. */
  requires: AssistantRequirement
  emptyStateAr: string
  /** Keywords for Telegram natural-language routing. */
  keywordsAr: readonly string[]
  modelSlug?: string
  maxSteps?: number
  /** Shown only in owner/ops chrome (tool names, etc.). */
  ownerHintAr?: string
}

export type AssistantCatalogItem = Pick<
  AssistantDef,
  | 'id'
  | 'nameAr'
  | 'taglineAr'
  | 'descriptionAr'
  | 'starterPromptAr'
  | 'requires'
  | 'emptyStateAr'
  | 'keywordsAr'
  | 'ownerHintAr'
> & {
  toolCount: number
}

export type AssistantRunResult = {
  assistantId: AssistantId
  nameAr: string
  text: string
  modelSlug: string
  toolNames: string[]
  steps: number
  citations: import('@/lib/scopes/types').RoomCitation[]
  pendingApprovalIds: string[]
  blocked?: {
    reason: 'google' | 'telegram' | 'auth'
    messageAr: string
  }
}
