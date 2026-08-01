'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BUILTIN_ROOM_AGENTS,
  SCOPE_AGENT_IDS,
  type RoomAgent,
} from '@/lib/rooms/agents'

export type AgentRosterState = {
  customAgents: RoomAgent[]
  /** Built-in agents removed from a scope (not deleted globally). */
  removedFromScope: Record<string, string[]>
  /** Extra agent ids seated in a scope (custom or re-added builtins). */
  addedToScope: Record<string, string[]>
  addCustomAgent: (input: {
    nameAr: string
    slug?: string
    systemPromptAr: string
    scopeId?: string
  }) => RoomAgent
  updateCustomAgent: (
    id: string,
    patch: Partial<Pick<RoomAgent, 'nameAr' | 'slug' | 'systemPromptAr' | 'avatarHue'>>
  ) => void
  deleteCustomAgent: (id: string) => void
  removeAgentFromScope: (scopeId: string, agentId: string) => void
  addAgentToScope: (scopeId: string, agentId: string) => void
  agentsForScope: (scopeId: string) => RoomAgent[]
  allAgents: () => RoomAgent[]
  findById: (id: string) => RoomAgent | undefined
  findByMention: (token: string) => RoomAgent | null
}

function slugify(nameAr: string, fallback: string) {
  const ascii = nameAr
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9_\-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return ascii || fallback
}

function hueFromId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360
  return h
}

export const useAgentRosterStore = create<AgentRosterState>()(
  persist(
    (set, get) => ({
      customAgents: [],
      removedFromScope: {},
      addedToScope: {},

      allAgents: () => {
        const custom = get().customAgents
        const customIds = new Set(custom.map((a) => a.id))
        return [
          ...BUILTIN_ROOM_AGENTS.filter((a) => !customIds.has(a.id)),
          ...custom,
        ]
      },

      findById: (id) => get().allAgents().find((a) => a.id === id),

      findByMention: (token) => {
        const t = token.trim()
        return (
          get()
            .allAgents()
            .find(
              (a) =>
                a.slug === t ||
                a.nameAr === t ||
                a.nameAr.replace(/\s+/g, '') === t.replace(/\s+/g, '') ||
                a.nameAr.includes(t)
            ) || null
        )
      },

      agentsForScope: (scopeId) => {
        const base = SCOPE_AGENT_IDS[scopeId] || ['agent-desk']
        const removed = new Set(get().removedFromScope[scopeId] || [])
        const added = get().addedToScope[scopeId] || []
        const ids = [
          ...base.filter((id) => !removed.has(id)),
          ...added.filter((id) => !base.includes(id) && !removed.has(id)),
        ]
        const catalog = get().allAgents()
        return ids
          .map((id) => catalog.find((a) => a.id === id))
          .filter((a): a is RoomAgent => Boolean(a))
      },

      addCustomAgent: (input) => {
        const id = `custom-${crypto.randomUUID().slice(0, 8)}`
        const slugBase = slugify(input.slug || input.nameAr, id.slice(-6))
        const existingSlugs = new Set(get().allAgents().map((a) => a.slug))
        let slug = slugBase
        let n = 2
        while (existingSlugs.has(slug)) {
          slug = `${slugBase}-${n++}`
        }
        const agent: RoomAgent = {
          id,
          nameAr: input.nameAr.trim() || 'وكيل جديد',
          slug,
          systemPromptAr:
            input.systemPromptAr.trim() ||
            'أنت وكيل في غرفة Arabic Buzz. أجب بالعربية الفصحى المهنية.',
          avatarHue: hueFromId(id),
          custom: true,
        }
        set((s) => {
          const addedToScope = { ...s.addedToScope }
          if (input.scopeId) {
            const list = [...(addedToScope[input.scopeId] || [])]
            if (!list.includes(agent.id)) list.push(agent.id)
            addedToScope[input.scopeId] = list
          }
          return {
            customAgents: [agent, ...s.customAgents],
            addedToScope,
          }
        })
        return agent
      },

      updateCustomAgent: (id, patch) => {
        set((s) => ({
          customAgents: s.customAgents.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...patch,
                  nameAr: patch.nameAr?.trim() || a.nameAr,
                  slug: patch.slug
                    ? slugify(patch.slug, a.slug)
                    : a.slug,
                  systemPromptAr:
                    patch.systemPromptAr?.trim() || a.systemPromptAr,
                }
              : a
          ),
        }))
      },

      deleteCustomAgent: (id) => {
        set((s) => {
          const addedToScope = { ...s.addedToScope }
          for (const scopeId of Object.keys(addedToScope)) {
            addedToScope[scopeId] = (addedToScope[scopeId] || []).filter(
              (x) => x !== id
            )
          }
          return {
            customAgents: s.customAgents.filter((a) => a.id !== id),
            addedToScope,
          }
        })
      },

      removeAgentFromScope: (scopeId, agentId) => {
        set((s) => {
          const removed = new Set(s.removedFromScope[scopeId] || [])
          removed.add(agentId)
          const added = (s.addedToScope[scopeId] || []).filter(
            (id) => id !== agentId
          )
          return {
            removedFromScope: {
              ...s.removedFromScope,
              [scopeId]: [...removed],
            },
            addedToScope: { ...s.addedToScope, [scopeId]: added },
          }
        })
      },

      addAgentToScope: (scopeId, agentId) => {
        set((s) => {
          const removed = (s.removedFromScope[scopeId] || []).filter(
            (id) => id !== agentId
          )
          const base = SCOPE_AGENT_IDS[scopeId] || []
          const added = [...(s.addedToScope[scopeId] || [])]
          if (!base.includes(agentId) && !added.includes(agentId)) {
            added.push(agentId)
          }
          return {
            removedFromScope: {
              ...s.removedFromScope,
              [scopeId]: removed,
            },
            addedToScope: { ...s.addedToScope, [scopeId]: added },
          }
        })
      },
    }),
    { name: 'arabic-buzz-agent-roster' }
  )
)
