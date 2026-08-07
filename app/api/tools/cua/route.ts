import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import {
  cuaBridgeConfigured,
  cuaHealth,
  executeCuaAction,
} from '@/lib/tools/cua-bridge'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { action, args } — forward to local Cua HTTP bridge. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    tool?: string
    args?: Record<string, unknown>
    arguments?: Record<string, unknown>
  }
  const result = await executeCuaAction(
    String(body.action || body.tool || ''),
    (body.args || body.arguments || {}) as Record<string, unknown>
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET() {
  const health = await cuaHealth()
  return NextResponse.json({
    configured: cuaBridgeConfigured(),
    online: health.online,
    messageAr: health.messageAr,
  })
}
