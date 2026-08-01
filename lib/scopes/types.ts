export type PersonalScope = {
  id: string
  userId: string
  nameAr: string
  descriptionAr?: string
  keychain: Record<string, string>
  privateMemory: string[]
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
}
