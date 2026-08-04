import { NextRequest, NextResponse } from 'next/server'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import { getDriveBrainFolderId } from '@/lib/google/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-side Drive → cloud brain sync for the association folder.
 * Auth: Bearer BRAIN_SYNC_SECRET / DRIVE_BRAIN_SYNC_SECRET / CRON_SECRET.
 * Owner: BRAIN_OWNER_USER_ID or DRIVE_BRAIN_OWNER_USER_ID (else latest Google token).
 */
export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const secret =
    process.env.BRAIN_SYNC_SECRET ||
    process.env.DRIVE_BRAIN_SYNC_SECRET ||
    process.env.CRON_SECRET ||
    process.env.AUDIT_EXPORT_SECRET ||
    ''
  const okSecret =
    Boolean(secret) &&
    secret !== 'change-me' &&
    header === `Bearer ${secret}`

  if (!okSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let userId =
    process.env.BRAIN_OWNER_USER_ID?.trim() ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    ''

  if (!userId) {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server')
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('google_oauth_tokens')
        .select('user_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      userId = (data?.user_id as string) || ''
    }
  }
  if (!userId) {
    return NextResponse.json(
      { error: 'لا يوجد حساب Google مربوط للفهرسة' },
      { status: 400 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    maxFiles?: number
    force?: boolean
  }
  const scopeId = body.scopeId || 'shared-demo'

  const rounds: Array<Record<string, unknown>> = []
  let hasMore = true
  let guard = 0
  while (hasMore && guard < 12) {
    guard += 1
    const result = await syncDriveFolderToBrain({
      userId,
      scopeId,
      folderId: getDriveBrainFolderId(),
      maxFiles: body.maxFiles ?? 6,
      force: Boolean(body.force) && guard === 1,
    })
    rounds.push({
      ingested: result.ingested,
      skipped: result.skipped,
      alreadyIndexed: result.alreadyIndexed,
      remaining: result.remaining,
      errors: result.errors.slice(0, 5),
    })
    hasMore = result.hasMore
    if (result.ingested === 0 && result.skipped === 0 && !hasMore) break
  }

  return NextResponse.json({
    ok: true,
    folderId: getDriveBrainFolderId(),
    folderUrl: `https://drive.google.com/drive/folders/${getDriveBrainFolderId()}`,
    brainMode: 'cloud',
    rounds,
    messageAr: 'اكتملت مزامنة عقل الشركة من Drive (سحابي).',
  })
}
