/**
 * Telegram agent pool — same seats as غرفة الفريق / مهام التشغيل.
 * Loads cloud roster when available; always exposes the full builtin pool
 * (وكيل١…٦ + custom up to soft cap 8) so the bot can enlist every seat.
 */

import {
  BUILTIN_ROOM_AGENTS,
  ROOM_AGENT_DEFAULT_EFFORT,
  ROOM_AGENT_DEFAULT_MODEL,
  ROOM_AGENT_SOFT_CAP,
  defaultAgentIdsForScope,
  type AgentCollabMode,
  type RoomAgent,
} from '@/lib/rooms/agents'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'
import {
  loadScopeAgentRoster,
  loadUserAgentRoster,
} from '@/lib/rooms/roster-persist'
import { getRoomAgentMaxParallel } from '@/lib/assistants/parallel'
import { parseRunEffort } from '@/lib/ai/run-effort'

/** Webhook-safe parallel cap (30s Netlify). Override: TELEGRAM_AGENT_PARALLEL. */
export function getTelegramAgentMaxParallel(): number {
  const roomMax = getRoomAgentMaxParallel()
  const raw = process.env.TELEGRAM_AGENT_PARALLEL?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n)) {
      return Math.min(ROOM_AGENT_SOFT_CAP, Math.max(1, Math.min(roomMax, n)))
    }
  }
  // Default 4: enough for team help without blowing the webhook budget.
  return Math.min(4, roomMax, ROOM_AGENT_SOFT_CAP)
}

function mergeOverride(
  agent: RoomAgent,
  override?: AgentRosterPayload['agentOverrides'][string]
): RoomAgent {
  const base: RoomAgent = {
    ...agent,
    preferredModel: agent.preferredModel || ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: parseRunEffort(
      agent.preferredEffort || ROOM_AGENT_DEFAULT_EFFORT
    ),
  }
  if (!override) return base
  return {
    ...base,
    ...override,
    nameAr: override.nameAr?.trim() || base.nameAr,
    slug: override.slug?.trim() || base.slug,
    systemPromptAr: override.systemPromptAr?.trim() || base.systemPromptAr,
    taskAr:
      override.taskAr !== undefined
        ? override.taskAr.trim() || undefined
        : base.taskAr,
    preferredModel: override.preferredModel?.trim() || base.preferredModel,
    preferredEffort: parseRunEffort(
      override.preferredEffort ?? base.preferredEffort
    ),
  }
}

/** Build seated list from roster payload (mirrors client store). */
export function seatedAgentsFromRosterPayload(
  scopeId: string,
  payload: AgentRosterPayload | null | undefined
): RoomAgent[] {
  const base = defaultAgentIdsForScope(scopeId)
  const removed = new Set(payload?.removedFromScope?.[scopeId] || [])
  const added = payload?.addedToScope?.[scopeId] || []
  const ids = [
    ...base.filter((id) => !removed.has(id)),
    ...added.filter((id) => !base.includes(id) && !removed.has(id)),
  ]

  const overrides = payload?.agentOverrides || {}
  const custom = payload?.customAgents || []
  const customIds = new Set(custom.map((a) => a.id))
  const catalog: RoomAgent[] = [
    ...BUILTIN_ROOM_AGENTS.filter((a) => !customIds.has(a.id)).map((a) =>
      mergeOverride(a, overrides[a.id])
    ),
    ...custom,
  ]

  return ids
    .map((id) => catalog.find((a) => a.id === id))
    .filter((a): a is RoomAgent => Boolean(a))
}

/**
 * Ensure Telegram can wake every builtin seat (وكيل١…٦) plus roster customs,
 * capped at ROOM_AGENT_SOFT_CAP — even when shared-demo defaults to 4 starters.
 */
export function expandTelegramAgentPool(seated: RoomAgent[]): RoomAgent[] {
  const ids = new Set(seated.map((a) => a.id))
  const extra = BUILTIN_ROOM_AGENTS.filter((a) => !ids.has(a.id))
  return [...seated, ...extra].slice(0, ROOM_AGENT_SOFT_CAP)
}

export type TelegramAgentPool = {
  agents: RoomAgent[]
  collabMode: AgentCollabMode
  fromRoster: boolean
}

/**
 * Load the full seat pool for a Telegram turn.
 * Prefer scope roster; fall back to user roster; always expand builtins.
 */
export async function loadTelegramAgentPool(opts: {
  scopeId: string
  userId?: string | null
}): Promise<TelegramAgentPool> {
  let payload: AgentRosterPayload | null = null
  try {
    payload = await loadScopeAgentRoster(opts.scopeId)
  } catch {
    payload = null
  }
  if (!payload && opts.userId) {
    try {
      payload = await loadUserAgentRoster(opts.userId)
    } catch {
      payload = null
    }
  }

  const seated = seatedAgentsFromRosterPayload(opts.scopeId, payload)
  const agents = expandTelegramAgentPool(
    seated.length ? seated : seatedAgentsFromRosterPayload(opts.scopeId, null)
  )
  const collabMode: AgentCollabMode =
    payload?.collabModeByScope?.[opts.scopeId] === 'team' ? 'team' : 'solo'

  return {
    agents,
    collabMode,
    fromRoster: Boolean(payload),
  }
}

/** Explicit team wake / «للوكلاء» / @الجميع. */
const TEAM_WAKE_RE =
  /(?:@?(?:الجميع|فريق|all|team)\b|للوكلاء|أبغا\s+للجميع|ابغا\s+للجميع|شغ[ّ]?ل\s+(?:كل\s+)?(?:ال)?وكلاء|كل\s+(?:ال)?وكلاء)/iu

/**
 * When true, wake multiple free seats in parallel (safe team fan-out).
 * Cascade (busy→next single) still applies when this is false.
 */
export function shouldTelegramTeamFanOut(opts: {
  raw: string
  workKind: string
  preferFullAgent: boolean
  forceHeavy: boolean
  collabMode: AgentCollabMode
  mentionedCount: number
  wantsAllToken: boolean
  broadcastIntent: boolean
}): boolean {
  if (opts.wantsAllToken || opts.broadcastIntent) return true
  if (opts.mentionedCount > 1) return true
  if (TEAM_WAKE_RE.test(opts.raw)) return true
  // Room collab «فريق» + actionable work → enlist free seats together.
  if (opts.collabMode === 'team' && opts.preferFullAgent) return true
  // Heavy file/mail/research work benefits from parallel seats.
  if (
    opts.preferFullAgent &&
    opts.forceHeavy &&
    (opts.workKind === 'file' ||
      opts.workKind === 'mail' ||
      opts.workKind === 'question')
  ) {
    return true
  }
  return false
}
