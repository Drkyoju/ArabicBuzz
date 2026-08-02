import type { AgentCollabMode, RoomAgent } from '@/lib/rooms/agents'

export type AgentRosterPayload = {
  customAgents: RoomAgent[]
  removedFromScope: Record<string, string[]>
  addedToScope: Record<string, string[]>
  collabModeByScope: Record<string, AgentCollabMode>
  agentOverrides: Record<
    string,
    Partial<
      Pick<
        RoomAgent,
        | 'nameAr'
        | 'slug'
        | 'systemPromptAr'
        | 'preferredModel'
        | 'taskAr'
        | 'avatarHue'
      >
    >
  >
}
