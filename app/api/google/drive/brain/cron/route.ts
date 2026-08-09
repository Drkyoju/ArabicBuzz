import { NextRequest, NextResponse } from 'next/server'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import {
  COMPANY_BRAIN_SCOPE_ID,
  getDriveBrainFolderId,
} from '@/lib/google/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  const { resolveDriveBrainOwnerUserId } = await import(
    '@/lib/channels/owner-context'
  )
  const userId = (await resolveDriveBrainOwnerUserId()) || ''
  if (!userId) {
    return NextResponse.json(
      {
        error:
          'لا يوجد حساب Google مربوط للفهرسة — اربط ryodan71@gmail.com أو عيّن DRIVE_BRAIN_OWNER_USER_ID',
      },
      { status: 400 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    maxFiles?: number
    force?: boolean
  }

  const rounds: Array<Record<string, unknown>> = []
  let hasMore = true
  let guard = 0
  while (hasMore && guard < 12) {
    guard += 1
    const result = await syncDriveFolderToBrain({
      userId,
      scopeId: COMPANY_BRAIN_SCOPE_ID,
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
