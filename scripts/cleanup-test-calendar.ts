/**
 * Soft-cancel QA calendar titles (اختبار تقويم الفريق، …) across all scopes.
 * Usage: npx tsx scripts/cleanup-test-calendar.ts
 * Requires DATABASE_URL or Supabase service role in .env.local — never prints secrets.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const { ensurePooledDatabaseUrl } = await import('../lib/db-url')
  ensurePooledDatabaseUrl()

  const { getSupabaseAdmin } = await import('../lib/supabase/server')
  const { isTestCalendarTitle } = await import('../lib/rooms/calendar-test-noise')

  const sb = getSupabaseAdmin()
  if (!sb) {
    console.error('Supabase admin unavailable — check SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const { data, error } = await sb
    .from('room_calendar_events')
    .select('id, scope_id, title_ar, status')
    .neq('status', 'cancelled')
    .limit(500)

  if (error) {
    console.error('query failed:', error.message)
    process.exit(1)
  }

  const targets = (data || []).filter((row) =>
    isTestCalendarTitle(String(row.title_ar || ''))
  )
  console.log(`Found ${targets.length} test event(s) to cancel`)

  let cancelled = 0
  for (const row of targets) {
    const { error: upErr } = await sb
      .from('room_calendar_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (upErr) {
      console.error('cancel failed', row.id, upErr.message)
    } else {
      cancelled += 1
      console.log(`cancelled · ${row.scope_id} · ${row.title_ar}`)
    }
  }
  console.log(`Done. Cancelled ${cancelled}/${targets.length}`)
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
