import { NextRequest, NextResponse } from 'next/server'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import { getDriveBrainFolderId } from '@/lib/google/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-side Drive → cloud brain sync (no browser session).
 * Uses the linked owner Google account on Netlify.
 * Auth: Authorization: Bearer <CRON_SECRET|DRIVE_BRAIN_SYNC_SECRET>
 */
export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret =
    process.env.DRIVE_BRAIN_SYNC_SECRET ||
    process.env.CRON_SECRET ||
    ''
  const ok =
    Boolean(secret) &&
    secret !== 'change-me' &&
    (header === `Bearer ${secret}` || alt === secret)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ownerUserId =
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    'bc4522fe-30a5-4e7a-9a85-5ac969d7b9ca'

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    maxFiles?: number
    force?: boolean
  }

  try {
    const result = await syncDriveFolderToBrain({
      userId: ownerUserId,
      scopeId: body.scopeId || 'shared-demo',
      folderId: getDriveBrainFolderId(),
      maxFiles: body.maxFiles ?? 8,
      force: Boolean(body.force),
    })
    return NextResponse.json({
      ...result,
      ownerUserId,
      brainMode: 'cloud',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 }
    )
  }
}
