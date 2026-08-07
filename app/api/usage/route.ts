import { requireWorkspaceOwner } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function riyadhDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Owner-only token usage dashboard data (per agent / per day).
 */
export async function GET(req: Request) {
  const auth = await requireWorkspaceOwner(
    req,
    'لوحة الاستهلاك للمالك فقط.'
  )
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const days = Math.min(
    31,
    Math.max(1, Number(url.searchParams.get('days') || 14) || 14)
  )
  const scopeId = (url.searchParams.get('scopeId') || '').trim()

  const sb = getSupabaseAdmin()
  if (!sb) {
    return Response.json(
      { error: 'Supabase غير متاح', rows: [], byAgent: [], byDay: [] },
      { status: 503 }
    )
  }

  const today = riyadhDayKey()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const startKey = riyadhDayKey(start)

  try {
    let q = sb
      .from('token_usage_daily')
      .select(
        'day_key, scope_id, agent_id, agent_name_ar, model_slug, input_tokens, output_tokens, total_tokens, runs, updated_at'
      )
      .gte('day_key', startKey)
      .lte('day_key', today)
      .order('day_key', { ascending: false })

    if (scopeId) q = q.eq('scope_id', scopeId)

    const { data, error } = await q.limit(2000)
    if (error) {
      return Response.json(
        {
          error: error.message,
          hintAr:
            'إن كان الجدول غير موجود شغّل ترحيل 034_token_usage.sql على Supabase.',
          rows: [],
          byAgent: [],
          byDay: [],
        },
        { status: 200 }
      )
    }

    const rows = (data || []) as Array<{
      day_key: string
      scope_id: string
      agent_id: string
      agent_name_ar: string
      model_slug: string
      input_tokens: number
      output_tokens: number
      total_tokens: number
      runs: number
    }>

    const agentMap = new Map<
      string,
      {
        agentId: string
        agentNameAr: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
        runs: number
      }
    >()
    const dayMap = new Map<
      string,
      { dayKey: string; totalTokens: number; runs: number }
    >()

    for (const r of rows) {
      const a = agentMap.get(r.agent_id) || {
        agentId: r.agent_id,
        agentNameAr: r.agent_name_ar,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        runs: 0,
      }
      a.inputTokens += Number(r.input_tokens) || 0
      a.outputTokens += Number(r.output_tokens) || 0
      a.totalTokens += Number(r.total_tokens) || 0
      a.runs += Number(r.runs) || 0
      agentMap.set(r.agent_id, a)

      const d = dayMap.get(r.day_key) || {
        dayKey: r.day_key,
        totalTokens: 0,
        runs: 0,
      }
      d.totalTokens += Number(r.total_tokens) || 0
      d.runs += Number(r.runs) || 0
      dayMap.set(r.day_key, d)
    }

    const byAgent = [...agentMap.values()].sort(
      (x, y) => y.totalTokens - x.totalTokens
    )
    const byDay = [...dayMap.values()].sort((x, y) =>
      y.dayKey.localeCompare(x.dayKey)
    )
    const totals = byAgent.reduce(
      (acc, a) => {
        acc.inputTokens += a.inputTokens
        acc.outputTokens += a.outputTokens
        acc.totalTokens += a.totalTokens
        acc.runs += a.runs
        return acc
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, runs: 0 }
    )

    return Response.json({
      ok: true,
      days,
      startKey,
      today,
      totals,
      byAgent,
      byDay,
      rows,
    })
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : 'تعذّر جلب الاستهلاك',
        rows: [],
        byAgent: [],
        byDay: [],
      },
      { status: 500 }
    )
  }
}
