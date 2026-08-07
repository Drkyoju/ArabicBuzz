'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BUILTIN_ROOM_AGENTS,
  ROOM_AGENT_DEFAULT_EFFORT,
  ROOM_AGENT_DEFAULT_MODEL,
  ROOM_AGENT_IDEAL_SEATS,
  ROOM_AGENT_SOFT_CAP,
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
  /**
   * Per-seat شغال/نائم. Missing key = asleep (default OFF).
   * Nested: scopeId → agentId → boolean
   */
  agentOnlineByScope: Record<string, Record<string, boolean>>
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
    /** Allow going past ROOM_AGENT_SOFT_CAP (owner confirmed). */
    allowOverCap?: boolean
  }) => RoomAgent[]
  /**
   * Remove surplus seats down to ideal (keeps builtins first, then oldest customs).
   * Returns removed agent ids.
   */
  pruneScopeToIdeal: (
    scopeId: string,
    keep?: number
  ) => { removedIds: string[]; kept: number }
  updateAgent: (id: string, patch: AgentEditableFields) => void
  /** @deprecated use updateAgent */
  updateCustomAgent: (id: string, patch: AgentEditableFields) => void
  clearAgentOverride: (id: string) => void
  deleteCustomAgent: (id: string) => void
  removeAgentFromScope: (scopeId: string, agentId: string) => void
  addAgentToScope: (
    scopeId: string,
    agentId: string,
    opts?: { allowOverCap?: boolean }
  ) => { ok: boolean; reasonAr?: string }
  setCollabMode: (scopeId: string, mode: AgentCollabMode) => void
  collabModeFor: (scopeId: string) => AgentCollabMode
  setAgentsEnabled: (scopeId: string, enabled: boolean) => void
  agentsEnabledFor: (scopeId: string) => boolean
  /** Per-seat awake — default false (نائم). */
  isAgentOnline: (scopeId: string, agentId: string) => boolean
  setAgentOnline: (scopeId: string, agentId: string, online: boolean) => void
  toggleAgentOnline: (scopeId: string, agentId: string) => boolean
  /** Put seat back to sleep + light habitual model/effort after a run. */
  sleepSeatAfterRun: (scopeId: string, agentId: string) => void
  /** Wake seats for a run (temporary شغال). */
  wakeSeats: (scopeId: string, agentIds: string[]) => void
  /** Ready seats only (online + in scope). */
  readyAgentsForScope: (scopeId: string) => RoomAgent[]
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

const GEMINI_DEFAULT = ROOM_AGENT_DEFAULT_MODEL
const GLM_DEFAULT = 'glm-4.5'

function normalizeSeatEffort(raw: unknown): RunEffort {
  return parseRunEffort(raw ?? ROOM_AGENT_DEFAULT_EFFORT)
}

function normalizeSeatModel(raw: unknown): string {
  const s = String(raw || '').trim()
  return s || ROOM_AGENT_DEFAULT_MODEL
}

/** One-time remap helper (kept for clarity). */
function remapSeatLightDefaults<
  T extends { preferredModel?: string; preferredEffort?: RunEffort },
>(agent: T): T {
  return {
    ...agent,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
  }
}

function mergeBuiltin(agent: RoomAgent, override?: AgentOverride): RoomAgent {
  const base: RoomAgent = {
    ...agent,
    preferredModel: agent.preferredModel || ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: normalizeSeatEffort(agent.preferredEffort),
  }
  if (!override) return base
  return {
    ...base,
    ...override,
    nameAr: override.nameAr?.trim() || base.nameAr,
    slug: override.slug ? slugify(override.slug, base.slug) : base.slug,
    systemPromptAr: override.systemPromptAr?.trim() || base.systemPromptAr,
    taskAr:
      override.taskAr !== undefined
        ? override.taskAr.trim() || undefined
        : base.taskAr,
    preferredModel: normalizeSeatModel(
      override.preferredModel || base.preferredModel
    ),
    preferredEffort: normalizeSeatEffort(
      override.preferredEffort ?? base.preferredEffort
    ),
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
      agentOnlineByScope: {},
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

      isAgentOnline: (scopeId, agentId) => {
        const map = get().agentOnlineByScope[scopeId]
        // Missing key = نائم (asleep by default)
        if (!map || map[agentId] === undefined) return false
        return map[agentId] === true
      },

      setAgentOnline: (scopeId, agentId, online) => {
        set((s) => ({
          agentOnlineByScope: {
            ...s.agentOnlineByScope,
            [scopeId]: {
              ...(s.agentOnlineByScope[scopeId] || {}),
              [agentId]: online,
            },
          },
        }))
      },

      toggleAgentOnline: (scopeId, agentId) => {
        const next = !get().isAgentOnline(scopeId, agentId)
        get().setAgentOnline(scopeId, agentId, next)
        return next
      },

      wakeSeats: (scopeId, agentIds) => {
        if (!agentIds.length) return
        set((s) => {
          const map = { ...(s.agentOnlineByScope[scopeId] || {}) }
          for (const id of agentIds) map[id] = true
          return {
            agentOnlineByScope: {
              ...s.agentOnlineByScope,
              [scopeId]: map,
            },
          }
        })
      },

      sleepSeatAfterRun: (scopeId, agentId) => {
        get().setAgentOnline(scopeId, agentId, false)
        const defaults = {
          preferredModel: ROOM_AGENT_DEFAULT_MODEL,
          preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
        }
        get().updateAgent(agentId, defaults)
      },

      readyAgentsForScope: (scopeId) => {
        if (!get().agentsEnabledFor(scopeId)) return []
        return get()
          .agentsForScope(scopeId)
          .filter((a) => get().isAgentOnline(scopeId, a.id))
      },

      exportPayload: () => ({
        customAgents: get().customAgents,
        removedFromScope: get().removedFromScope,
        addedToScope: get().addedToScope,
        collabModeByScope: get().collabModeByScope,
        agentsEnabledByScope: get().agentsEnabledByScope,
        agentOnlineByScope: get().agentOnlineByScope,
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
          agentOnlineByScope: payload.agentOnlineByScope || {},
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
          agentOnlineByScope: merged.agentOnlineByScope || {},
          agentOverrides: merged.agentOverrides,
          cloudSyncedAt: Date.now(),
        })
      },

      markCloudSynced: () => set({ cloudSyncedAt: Date.now() }),

      addCustomAgent: (input) => {
        const seatedBefore = input.scopeId
          ? get().agentsForScope(input.scopeId).length
          : 0
        const seatNow =
          Boolean(input.scopeId) && seatedBefore < ROOM_AGENT_SOFT_CAP
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
          preferredModel: normalizeSeatModel(
            input.preferredModel || GEMINI_DEFAULT
          ),
          preferredEffort: normalizeSeatEffort(
            input.preferredEffort ?? ROOM_AGENT_DEFAULT_EFFORT
          ),
          avatarHue: hueFromId(id),
          custom: true,
        }
        set((s) => {
          const addedToScope = { ...s.addedToScope }
          if (input.scopeId && seatNow) {
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

      pruneScopeToIdeal: (scopeId, keep) => {
        const target = Math.max(
          1,
          Math.min(
            ROOM_AGENT_SOFT_CAP,
            Math.floor(keep ?? ROOM_AGENT_IDEAL_SEATS) || ROOM_AGENT_IDEAL_SEATS
          )
        )
        const seated = get().agentsForScope(scopeId)
        if (seated.length <= target) {
          return { removedIds: [], kept: seated.length }
        }
        // Keep builtins first (stable roles), then earliest customs by list order
        const builtins = seated.filter((a) => !a.custom)
        const customs = seated.filter((a) => a.custom)
        const keepList = [...builtins, ...customs].slice(0, target)
        const keepIds = new Set(keepList.map((a) => a.id))
        const removedIds = seated
          .filter((a) => !keepIds.has(a.id))
          .map((a) => a.id)
        for (const id of removedIds) {
          get().removeAgentFromScope(scopeId, id)
        }
        return { removedIds, kept: keepList.length }
      },

      addTeamBatch: (input) => {
        const seatedCount = get().agentsForScope(input.scopeId).length
        const roomLeft = Math.max(0, ROOM_AGENT_SOFT_CAP - seatedCount)
        const requested = Math.max(1, Math.floor(input.count) || 1)
        const count = input.allowOverCap
          ? Math.min(ROOM_AGENT_SOFT_CAP, requested) // hard ceiling even with override
          : Math.min(roomLeft, requested)
        if (count <= 0) return []
        const model = resolveBatchModel(input)
        const effort = normalizeSeatEffort(
          input.preferredEffort ?? ROOM_AGENT_DEFAULT_EFFORT
        )
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

      addAgentToScope: (scopeId, agentId, opts) => {
        const seated = get().agentsForScope(scopeId)
        if (seated.some((a) => a.id === agentId)) {
          return { ok: true }
        }
        if (
          seated.length >= ROOM_AGENT_SOFT_CAP &&
          !opts?.allowOverCap
        ) {
          return {
            ok: false,
            reasonAr: `المقاعد ممتلئة (حدّ موصى به ${ROOM_AGENT_SOFT_CAP}). قلّم الزائد أو أكّد الإضافة فوق السقف.`,
          }
        }
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
        return { ok: true }
      },
    }),
    {
      name: 'arabic-buzz-agent-roster',
      version: 7,
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
        const customAgents = (
          Array.isArray(p.customAgents) ? p.customAgents : []
        ).map((a) => ({
          ...(a as RoomAgent),
          preferredModel: ROOM_AGENT_DEFAULT_MODEL,
          preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
        }))
        const agentOverrides: Record<string, AgentOverride> = {}
        for (const [id, ov] of Object.entries(p.agentOverrides || {})) {
          agentOverrides[id] = {
            ...ov,
            preferredModel: ROOM_AGENT_DEFAULT_MODEL,
            preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
          }
        }
        // All seats asleep by default (wake on message / @ / click).
        const agentOnlineByScope: Record<string, Record<string, boolean>> = {}
        const allIds = new Set<string>([
          ...BUILTIN_ROOM_AGENTS.map((a) => a.id),
          ...customAgents.map((a) => a.id),
        ])
        const scopeKeys = new Set<string>([
          ...Object.keys(p.addedToScope || {}),
          ...Object.keys(p.removedFromScope || {}),
          ...Object.keys(p.agentOnlineByScope || {}),
          ...Object.keys(SCOPE_AGENT_IDS),
        ])
        for (const scopeId of scopeKeys) {
          const map: Record<string, boolean> = {}
          for (const id of allIds) map[id] = false
          // Preserve mid-run awake only if previously true — still migrate to asleep
          // (user asked default asleep; active stream will re-wake via wakeSeats).
          agentOnlineByScope[scopeId] = map
        }
        return {
          customAgents,
          removedFromScope: p.removedFromScope || {},
          addedToScope: p.addedToScope || {},
          collabModeByScope: p.collabModeByScope || {},
          agentsEnabledByScope: enabled,
          agentOnlineByScope,
          agentOverrides,
        }
      },
      partialize: (s) => ({
        customAgents: s.customAgents,
        removedFromScope: s.removedFromScope,
        addedToScope: s.addedToScope,
        collabModeByScope: s.collabModeByScope,
        agentsEnabledByScope: s.agentsEnabledByScope,
        agentOnlineByScope: s.agentOnlineByScope,
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
          agentOnlineByScope:
            p.agentOnlineByScope || current.agentOnlineByScope || {},
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
