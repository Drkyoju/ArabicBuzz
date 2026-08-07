import type { AgentCollabMode, RoomAgent } from '@/lib/rooms/agents'

export type AgentRosterPayload = {
  customAgents: RoomAgent[]
  removedFromScope: Record<string, string[]>
  addedToScope: Record<string, string[]>
  collabModeByScope: Record<string, AgentCollabMode>
  /**
   * Master switch per room: when false, humans chat/notes only (no agent replies).
   * Missing key = enabled (default ON).
   */
  agentsEnabledByScope?: Record<string, boolean>
  /**
   * Per-seat power in a scope. Missing agent id = online/ready (default ON, 24h).
   * `false` = طافي — user toggled off; skipped for watch/work.
   */
  agentOnlineByScope?: Record<string, Record<string, boolean>>
  agentOverrides: Record<
    string,
    Partial<
      Pick<
        RoomAgent,
        | 'nameAr'
        | 'slug'
        | 'systemPromptAr'
        | 'preferredModel'
        | 'preferredEffort'
        | 'taskAr'
        | 'avatarHue'
      >
    >
  >
}
