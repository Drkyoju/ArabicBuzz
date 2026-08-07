import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type UsageRecordInput = {
  scopeId?: string
  agentId?: string
  agentNameAr?: string
  modelSlug?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

function riyadhDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function asNonNeg(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v < 0) return 0
  return Math.floor(v)
}

/** Fire-and-forget upsert into token_usage_daily (Supabase). */
export async function recordTokenUsage(
  input: UsageRecordInput
): Promise<void> {
  const sb = getSupabaseAdmin()
  if (!sb) return

  const dayKey = riyadhDayKey()
  const scopeId = String(input.scopeId || 'shared-demo').trim() || 'shared-demo'
  const agentId = String(input.agentId || 'unknown').trim() || 'unknown'
  const agentNameAr =
    String(input.agentNameAr || 'وكيل').trim().slice(0, 80) || 'وكيل'
  const modelSlug = String(input.modelSlug || '').trim().slice(0, 120)
  const inputTokens = asNonNeg(input.inputTokens)
  const outputTokens = asNonNeg(input.outputTokens)
  let totalTokens = asNonNeg(input.totalTokens)
  if (!totalTokens) totalTokens = inputTokens + outputTokens
  if (!totalTokens && !inputTokens && !outputTokens) return

  try {
    const { data: existing } = await sb
      .from('token_usage_daily')
      .select('id, input_tokens, output_tokens, total_tokens, runs')
      .eq('day_key', dayKey)
      .eq('scope_id', scopeId)
      .eq('agent_id', agentId)
      .eq('model_slug', modelSlug)
      .maybeSingle()

    if (existing?.id) {
      const row = existing as {
        id: string
        input_tokens: number
        output_tokens: number
        total_tokens: number
        runs: number
      }
      await sb
        .from('token_usage_daily')
        .update({
          agent_name_ar: agentNameAr,
          input_tokens: asNonNeg(row.input_tokens) + inputTokens,
          output_tokens: asNonNeg(row.output_tokens) + outputTokens,
          total_tokens: asNonNeg(row.total_tokens) + totalTokens,
          runs: asNonNeg(row.runs) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      return
    }

    await sb.from('token_usage_daily').insert({
      id: randomUUID(),
      day_key: dayKey,
      scope_id: scopeId,
      agent_id: agentId,
      agent_name_ar: agentNameAr,
      model_slug: modelSlug,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      runs: 1,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn(
      '[usage] record failed',
      e instanceof Error ? e.message : e
    )
  }
}

/** Extract tokens from AI SDK generateText result (v4/v5/v7 shapes). */
export function usageFromGenerateResult(result: {
  usage?: Record<string, unknown>
  totalUsage?: Record<string, unknown>
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const u = (result.totalUsage || result.usage || {}) as Record<
    string,
    unknown
  >
  const inputTokens = asNonNeg(
    u.inputTokens ?? u.promptTokens ?? u.input_tokens ?? u.prompt_tokens
  )
  const outputTokens = asNonNeg(
    u.outputTokens ??
      u.completionTokens ??
      u.output_tokens ??
      u.completion_tokens
  )
  const totalTokens = asNonNeg(
    u.totalTokens ?? u.total_tokens ?? inputTokens + outputTokens
  )
  return { inputTokens, outputTokens, totalTokens }
}
