import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getLiveZoomSnapshot } from '@/lib/zoom/live-status'

export const dynamic = 'force-dynamic'

/** Are any Zoom sessions live right now? */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  try {
    const snap = await getLiveZoomSnapshot({ scopeId })
    return NextResponse.json(snap)
  } catch (e) {
    return NextResponse.json(
      {
        configured: false,
        liveCount: 0,
        meetings: [],
        checkedAt: new Date().toISOString(),
        messageAr: e instanceof Error ? e.message : 'فشل فحص Zoom',
      },
      { status: 500 }
    )
  }
}
