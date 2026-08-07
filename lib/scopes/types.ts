export type PersonalScope = {
  id: string
  userId: string
  nameAr: string
  descriptionAr?: string
  keychain: Record<string, string>
  privateMemory: string[]
  archived?: boolean
}

export type SharedScope = {
  id: string
  nameAr: string
  descriptionAr?: string
  members: string[]
  memberLabelsAr: string[]
  agentLabelsAr: string[]
  sharedMemory: string[]
  skills: string[]
  archived?: boolean
}

export type Scope = PersonalScope | SharedScope
export type ScopeKind = 'personal' | 'shared'

export type ActiveScopeContext = {
  kind: ScopeKind
  scope: Scope
  memory: string[]
  allowedSkills?: string[]
  userId: string
}

/** A post in a shared room timeline (human or agent peer). */
export type RoomAuthorKind = 'human' | 'agent' | 'system' | 'channel'

export type RoomCitation = {
  labelAr: string
  excerpt?: string
  /** Optional deep-link (Drive / file / URL) */
  url?: string
}

/** Downloadable file produced by agent tools (edit_document, etc.). */
export type RoomFileAttachment = {
  fileId: string
  name: string
  mimeType?: string
  scopeId: string
  downloadPath?: string
  /** True when agent edited / replaced content (show «تم التعديل»). */
  edited?: boolean
}

export type RoomPostKind = 'chat' | 'decision' | 'minutes'

export type RoomPost = {
  id: string
  scopeId: string
  authorKind: RoomAuthorKind
  authorId: string
  authorNameAr: string
  content: string
  createdAt: number
  streaming?: boolean
  qualityWarning?: boolean
  /** Brain / RAG source chips under agent replies. */
  citations?: RoomCitation[]
  /** Edited/created workspace files ready to download. */
  attachments?: RoomFileAttachment[]
  /** When a tool paused for HITL during this reply. */
  pendingApprovalId?: string
  /** chat | decision | minutes — ack UI only on decision/minutes */
  postKind?: RoomPostKind
  /** App user ids mentioned via @member */
  mentionUserIds?: string[]
  /** Directed @agent seat for this turn (wake / handoff). */
  mentionAgentId?: string
}
