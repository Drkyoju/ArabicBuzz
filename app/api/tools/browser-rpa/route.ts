import { NextRequest, NextResponse } from 'next/server'
import { executeBrowserTask, isBrowserRpaConfigured } from '@/lib/tools/browser-rpa'
import { requireUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { taskPrompt, targetUrl } — headless browser RPA via remote bridge. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    taskPrompt?: string
    targetUrl?: string
  }
  const result = await executeBrowserTask(
    String(body.taskPrompt || ''),
    String(body.targetUrl || '')
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET() {
  return NextResponse.json({
    configured: isBrowserRpaConfigured(),
    messageAr: isBrowserRpaConfigured()
      ? 'أتمتة المتصفح جاهزة.'
      : 'اضبط BROWSER_USE_URL أو STEEL_API_KEY.',
  })
}
