/**
 * General-purpose Arabic work core (نواة عامة) — not association packaging.
 * Thin presets over the existing agent engine + tool registry.
 */

export type AssistantId =
  | 'day-captain'
  | 'inbox-zero'
  | 'daily-brief'
  | 'file-search'
  | 'file-office'
  | 'telegram-captain'
  | 'general'

export type AssistantRequirement = 'none' | 'google' | 'telegram' | 'mail'

export type AssistantUsedTool = {
  name: string
  labelAr: string
  summaryAr: string
}

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
  /** Tools bound for this run (allow-list). */
  toolNames: string[]
  /** Tools actually invoked during the run. */
  usedTools: AssistantUsedTool[]
  steps: number
  citations: import('@/lib/scopes/types').RoomCitation[]
  pendingApprovalIds: string[]
  blocked?: {
    reason: 'google' | 'telegram' | 'mail' | 'auth'
    messageAr: string
  }
}

export type AssistantJobStatus =
  | 'waiting'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'

/** Persisted queue item for the composer → worker pool. */
export type AssistantJob = {
  id: string
  scopeId: string
  userId: string
  message: string
  assistantId: AssistantId
  assistantNameAr: string
  matchedBy: string
  status: AssistantJobStatus
  resultText: string | null
  usedTools: AssistantUsedTool[]
  pendingApprovalIds: string[]
  errorAr: string | null
  etaSeconds: number
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  /** Harness model for this run (Gemini / GLM / AgentRouter). */
  modelSlug: string | null
  /** Run power: LOW | MEDIUM | HIGH | MAX */
  effortLevel: string | null
  createdAt: string
  updatedAt: string
}
