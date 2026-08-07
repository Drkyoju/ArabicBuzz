'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BUILTIN_ROOM_AGENTS,
  SCOPE_AGENT_IDS,
  defaultAgentIdsForScope,
  type AgentCollabMode,
  type RoomAgent,
} from '@/lib/rooms/agents'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'
import { defaultSeatNameAr } from '@/lib/rooms/agent-names'
import { parseRunEffort, type RunEffort } from '@/lib/ai/run-effort'
import {
  agentsAlwaysPresentInRoom,
  mergeScopeRosterSlice,
  usesSharedRoomRoster,
} from '@/lib/rooms/roster-scope'

export type AgentOverride = Partial<
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

type AgentEditableFields = Partial<
  Pick<
    RoomAgent,
    | 'nameAr'
    | 'slug'
    | 'systemPromptAr'
    | 'avatarHue'
    | 'preferredModel'
    | 'preferredEffort'
    | 'taskAr'
  >
>

export type AgentRosterState = {
  customAgents: RoomAgent[]
  removedFromScope: Record<string, string[]>
  addedToScope: Record<string, string[]>
  collabModeByScope: Record<string, AgentCollabMode>
  /** Master switch: agents reply when true (default). */
  agentsEnabledByScope: Record<string, boolean>
  /** Overrides for built-in agents (name/task/model/prompt). */
  agentOverrides: Record<string, AgentOverride>
  cloudSyncedAt: number | null
  addCustomAgent: (input: {
    nameAr: string
    slug?: string
    systemPromptAr?: string
    taskAr?: string
    preferredModel?: string
    preferredEffort?: RunEffort
    scopeId?: string
  }) => RoomAgent
  addTeamBatch: (input: {
    scopeId: string
    /** @deprecated Prefer preferredModel — maps to default Gemini/GLM slug. */
    provider?: 'google' | 'glm' | 'agentrouter'
    preferredModel?: string
    preferredEffort?: RunEffort
    count: number
    namePrefixAr?: string
  }) => RoomAgent[]
  updateAgent: (id: string, patch: AgentEditableFields) => void
  /** @deprecated use updateAgent */
  updateCustomAgent: (id: string, patch: AgentEditableFields) => void
  clearAgentOverride: (id: string) => void
  deleteCustomAgent: (id: string) => void
  removeAgentFromScope: (scopeId: string, agentId: string) => void
  addAgentToScope: (scopeId: string, agentId: string) => void
  setCollabMode: (scopeId: string, mode: AgentCollabMode) => void
  collabModeFor: (scopeId: string) => AgentCollabMode
  setAgentsEnabled: (scopeId: string, enabled: boolean) => void
  agentsEnabledFor: (scopeId: string) => boolean
  agentsForScope: (scopeId: string) => RoomAgent[]
  allAgents: () => RoomAgent[]
  findById: (id: string) => RoomAgent | undefined
  findByMention: (token: string) => RoomAgent | null
  exportPayload: () => AgentRosterPayload
  hydrateFromCloud: (payload: AgentRosterPayload) => void
  /** Merge one room's shared roster without wiping other scopes. */
  hydrateScopeFromCloud: (scopeId: string, payload: AgentRosterPayload) => void
  markCloudSynced: () => void
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

function uniqueSlug(base: string, taken: Set<string>) {
  let slug = slugify(base, 'agent')
  let n = 2
  while (taken.has(slug)) {
    slug = `${slugify(base, 'agent').slice(0, 24)}-${n++}`
  }
  taken.add(slug)
  return slug
}

const GEMINI_DEFAULT = 'gemini-3.1-pro'
const GLM_DEFAULT = 'glm-4.5'

function mergeBuiltin(agent: RoomAgent, override?: AgentOverride): RoomAgent {
  if (!override) return agent
  return {
    ...agent,
    ...override,
    nameAr: override.nameAr?.trim() || agent.nameAr,
    slug: override.slug ? slugify(override.slug, agent.slug) : agent.slug,
    systemPromptAr: override.systemPromptAr?.trim() || agent.systemPromptAr,
    taskAr:
      override.taskAr !== undefined
        ? override.taskAr.trim() || undefined
        : agent.taskAr,
    preferredModel: override.preferredModel || agent.preferredModel,
    preferredEffort: override.preferredEffort || agent.preferredEffort,
  }
}

function resolveBatchModel(input: {
  preferredModel?: string
  provider?: 'google' | 'glm' | 'agentrouter'
}): string {
  if (input.preferredModel?.trim()) return input.preferredModel.trim()
  if (input.provider === 'glm') return GLM_DEFAULT
  if (input.provider === 'agentrouter') return 'claude-opus-5'
  return GEMINI_DEFAULT
}

function slugPrefixForModel(model: string): string {
  if (model.startsWith('glm')) return 'glm'
  if (model.startsWith('claude') || model.startsWith('gpt')) return 'ar'
  if (model.startsWith('gemini')) return 'gemini'
  return 'agent'
}

export const useAgentRosterStore = create<AgentRosterState>()(
  persist(
    (set, get) => ({
      customAgents: [],
      removedFromScope: {},
      addedToScope: {},
      collabModeByScope: {},
      agentsEnabledByScope: {},
      agentOverrides: {},
      cloudSyncedAt: null,

      allAgents: () => {
        const custom = get().customAgents || []
        const customIds = new Set(custom.map((a) => a.id))
        const overrides = get().agentOverrides || {}
        return [
          ...BUILTIN_ROOM_AGENTS.filter((a) => !customIds.has(a.id)).map((a) =>
            mergeBuiltin(a, overrides[a.id])
          ),
          ...custom,
        ]
      },

      findById: (id) => get().allAgents().find((a) => a.id === id),

      findByMention: (token) => {
        const t = token.trim()
        const compact = t.replace(/\s+/g, '')
        const west = (s: string) =>
          s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        return (
          get()
            .allAgents()
            .find((a) => {
              if (a.id === t || a.id === `agent-${t}`) return true
              if (a.slug === t || a.slug.toLowerCase() === t.toLowerCase()) {
                return true
              }
              const nameFlat = a.nameAr.replace(/\s+/g, '')
              return (
                a.nameAr === t ||
                nameFlat === compact ||
                west(nameFlat) === west(compact) ||
                a.nameAr.includes(t)
              )
            }) || null
        )
      },

      agentsForScope: (scopeId) => {
        const base = defaultAgentIdsForScope(scopeId)
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

      collabModeFor: (scopeId) => get().collabModeByScope[scopeId] || 'solo',

      setCollabMode: (scopeId, mode) => {
        set((s) => ({
          collabModeByScope: { ...s.collabModeByScope, [scopeId]: mode },
        }))
      },

      agentsEnabledFor: (scopeId) => {
        // Team rooms: agents stay continuous — cannot go «بشر فقط».
        if (agentsAlwaysPresentInRoom(scopeId)) return true
        return get().agentsEnabledByScope[scopeId] !== false
      },

      setAgentsEnabled: (scopeId, enabled) => {
        if (agentsAlwaysPresentInRoom(scopeId) && !enabled) return
        set((s) => ({
          agentsEnabledByScope: {
            ...s.agentsEnabledByScope,
            [scopeId]: enabled,
          },
        }))
      },

      exportPayload: () => ({
        customAgents: get().customAgents,
        removedFromScope: get().removedFromScope,
        addedToScope: get().addedToScope,
        collabModeByScope: get().collabModeByScope,
        agentsEnabledByScope: get().agentsEnabledByScope,
        agentOverrides: get().agentOverrides,
      }),

      hydrateFromCloud: (payload) => {
        const enabled = { ...(payload.agentsEnabledByScope || {}) }
        for (const scopeId of Object.keys(enabled)) {
          if (usesSharedRoomRoster(scopeId)) enabled[scopeId] = true
        }
        set({
          customAgents: payload.customAgents || [],
          removedFromScope: payload.removedFromScope || {},
          addedToScope: payload.addedToScope || {},
          collabModeByScope: payload.collabModeByScope || {},
          agentsEnabledByScope: enabled,
          agentOverrides: payload.agentOverrides || {},
          cloudSyncedAt: Date.now(),
        })
      },

      hydrateScopeFromCloud: (scopeId, payload) => {
        const current = get().exportPayload()
        const merged = mergeScopeRosterSlice(scopeId, current, payload)
        const enabled = { ...(merged.agentsEnabledByScope || {}) }
        if (usesSharedRoomRoster(scopeId)) enabled[scopeId] = true
        set({
          customAgents: merged.customAgents,
          removedFromScope: merged.removedFromScope,
          addedToScope: merged.addedToScope,
          collabModeByScope: merged.collabModeByScope,
          agentsEnabledByScope: enabled,
          agentOverrides: merged.agentOverrides,
          cloudSyncedAt: Date.now(),
        })
      },

      markCloudSynced: () => set({ cloudSyncedAt: Date.now() }),

      addCustomAgent: (input) => {
        const id = `custom-${crypto.randomUUID().slice(0, 8)}`
        const taken = new Set(get().allAgents().map((a) => a.slug))
        const slug = uniqueSlug(input.slug || input.nameAr, taken)
        const taskAr = input.taskAr?.trim() || ''
        const nameAr =
          input.nameAr.trim() ||
          defaultSeatNameAr((get().customAgents?.length || 0) + 1)
        const systemPromptAr =
          input.systemPromptAr?.trim() ||
          `أنت «${nameAr}» في غرفة Arabic Buzz. نفّذ الطلبات التي تُوجَّه إليك (مثل @mention) بالعربية الفصحى المهنية.`
        const agent: RoomAgent = {
          id,
          nameAr,
          slug,
          systemPromptAr,
          taskAr: taskAr || undefined,
          preferredModel: input.preferredModel || GEMINI_DEFAULT,
          preferredEffort: parseRunEffort(input.preferredEffort),
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

      addTeamBatch: (input) => {
        const count = Math.max(1, Math.min(10, Math.floor(input.count) || 1))
        const model = resolveBatchModel(input)
        const effort = parseRunEffort(input.preferredEffort)
        const seatedCount = get().agentsForScope(input.scopeId).length
        const created: RoomAgent[] = []
        const taken = new Set(get().allAgents().map((a) => a.slug))
        const useCustomPrefix = Boolean(input.namePrefixAr?.trim())
        const slugBase = slugPrefixForModel(model)

        for (let i = 1; i <= count; i++) {
          const id = `custom-${crypto.randomUUID().slice(0, 8)}`
          const seatIndex = seatedCount + i
          const nameAr = useCustomPrefix
            ? `${input.namePrefixAr!.trim()} ${i}`
            : defaultSeatNameAr(seatIndex)
          const slug = uniqueSlug(`${slugBase}-${i}`, taken)
          const agent: RoomAgent = {
            id,
            nameAr,
            slug,
            preferredModel: model,
            preferredEffort: effort,
            systemPromptAr: `أنت «${nameAr}» في غرفة عمل مشتركة. نفّذ الطلبات التي تُوجَّه إليك بالعربية الفصحى. في وضع التعاون اطّلع على ملاحظات زملائك الوكلاء وساعدهم دون تكرار عملهم.`,
            avatarHue: hueFromId(id),
            custom: true,
          }
          created.push(agent)
        }

        set((s) => {
          const addedToScope = { ...s.addedToScope }
          const list = [...(addedToScope[input.scopeId] || [])]
          for (const a of created) {
            if (!list.includes(a.id)) list.push(a.id)
          }
          addedToScope[input.scopeId] = list
          return {
            customAgents: [...created, ...s.customAgents],
            addedToScope,
            collabModeByScope: {
              ...s.collabModeByScope,
              [input.scopeId]: s.collabModeByScope[input.scopeId] || 'team',
            },
          }
        })
        return created
      },

      updateAgent: (id, patch) => {
        const isCustom = get().customAgents.some((a) => a.id === id)
        if (isCustom) {
          set((s) => ({
            customAgents: s.customAgents.map((a) =>
              a.id === id
                ? {
                    ...a,
                    ...patch,
                    nameAr: patch.nameAr?.trim() || a.nameAr,
                    slug: patch.slug ? slugify(patch.slug, a.slug) : a.slug,
                    systemPromptAr:
                      patch.systemPromptAr?.trim() || a.systemPromptAr,
                    taskAr:
                      patch.taskAr !== undefined
                        ? patch.taskAr.trim() || undefined
                        : a.taskAr,
                    preferredModel: patch.preferredModel || a.preferredModel,
                    preferredEffort:
                      patch.preferredEffort !== undefined
                        ? parseRunEffort(patch.preferredEffort)
                        : a.preferredEffort,
                  }
                : a
            ),
          }))
          return
        }
        const builtin = BUILTIN_ROOM_AGENTS.find((a) => a.id === id)
        if (!builtin) return
        set((s) => ({
          agentOverrides: {
            ...s.agentOverrides,
            [id]: {
              ...s.agentOverrides[id],
              ...patch,
              nameAr: patch.nameAr?.trim() || s.agentOverrides[id]?.nameAr,
              slug: patch.slug
                ? slugify(patch.slug, builtin.slug)
                : s.agentOverrides[id]?.slug,
              systemPromptAr:
                patch.systemPromptAr?.trim() ||
                s.agentOverrides[id]?.systemPromptAr,
              taskAr:
                patch.taskAr !== undefined
                  ? patch.taskAr.trim() || undefined
                  : s.agentOverrides[id]?.taskAr,
              preferredModel:
                patch.preferredModel || s.agentOverrides[id]?.preferredModel,
              preferredEffort:
                patch.preferredEffort !== undefined
                  ? parseRunEffort(patch.preferredEffort)
                  : s.agentOverrides[id]?.preferredEffort,
            },
          },
        }))
      },

      updateCustomAgent: (id, patch) => get().updateAgent(id, patch),

      clearAgentOverride: (id) => {
        set((s) => {
          const next = { ...s.agentOverrides }
          delete next[id]
          return { agentOverrides: next }
        })
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
          const base = defaultAgentIdsForScope(scopeId)
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
    {
      name: 'arabic-buzz-agent-roster',
      version: 4,
      migrate: (persisted) => {
        const p = (persisted || {}) as Partial<AgentRosterState>
        const enabled = { ...(p.agentsEnabledByScope || {}) }
        // Re-open team rooms that were left on «محادثة فقط» / humans-only.
        for (const scopeId of Object.keys(enabled)) {
          if (usesSharedRoomRoster(scopeId)) enabled[scopeId] = true
        }
        for (const scopeId of Object.keys(SCOPE_AGENT_IDS)) {
          if (usesSharedRoomRoster(scopeId)) enabled[scopeId] = true
        }
        return {
          customAgents: Array.isArray(p.customAgents) ? p.customAgents : [],
          removedFromScope: p.removedFromScope || {},
          addedToScope: p.addedToScope || {},
          collabModeByScope: p.collabModeByScope || {},
          agentsEnabledByScope: enabled,
          agentOverrides: p.agentOverrides || {},
        }
      },
      partialize: (s) => ({
        customAgents: s.customAgents,
        removedFromScope: s.removedFromScope,
        addedToScope: s.addedToScope,
        collabModeByScope: s.collabModeByScope,
        agentsEnabledByScope: s.agentsEnabledByScope,
        agentOverrides: s.agentOverrides,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AgentRosterState>
        return {
          ...current,
          ...p,
          customAgents: Array.isArray(p.customAgents)
            ? p.customAgents
            : current.customAgents,
          removedFromScope: p.removedFromScope || current.removedFromScope,
          addedToScope: p.addedToScope || current.addedToScope,
          collabModeByScope: p.collabModeByScope || current.collabModeByScope,
          agentsEnabledByScope:
            p.agentsEnabledByScope || current.agentsEnabledByScope || {},
          agentOverrides: p.agentOverrides || current.agentOverrides || {},
        }
      },
    }
  )
)

/** Build system block including task + optional peer notes. */
export function buildAgentSystemExtras(agent: RoomAgent, peerNotesAr?: string) {
  const parts: string[] = []
  if (agent.taskAr) {
    parts.push(`المهمة المعيّنة لهذا الوكيل: ${agent.taskAr}`)
  }
  if (peerNotesAr?.trim()) {
    parts.push(
      `وضع التعاون مفعّل. اطّلع على عمل الزملاء التالي وكمّله أو صحّحه دون تكرار عديم الفائدة:\n${peerNotesAr.trim()}`
    )
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : ''
}
