export type PersonalScope = {
  id: string
  userId: string
  keychain: Record<string, string>
  privateMemory: string[]
}

export type SharedScope = {
  id: string
  nameAr: string
  members: string[]
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
