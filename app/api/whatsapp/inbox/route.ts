import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import { resumeWhatsAppInboxWithOwnerAnswer } from '@/lib/whatsapp/inbox-orchestrator'
import { listPendingOwnerThreads } from '@/lib/whatsapp/pending-store'

export const dynamic = 'force-dynamic'

/** List pending WhatsApp inbox threads awaiting owner. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const scopeId =
    req.nextUrl.searchParams.get('scopeId') ||
    process.env.WHATSAPP_DEFAULT_SCOPE_ID ||
    undefined

  const threads = await listPendingOwnerThreads(scopeId || undefined)
  return NextResponse.json({
    ok: true,
    threads,
    count: threads.length,
  })
}

/** Owner reply to resume a paused WhatsApp inbox thread. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: {
    threadId?: string
    answerAr?: string
    scopeId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const answerAr = body.answerAr?.trim()
  if (!answerAr) {
    return NextResponse.json({ error: 'answerAr مطلوب' }, { status: 400 })
  }

  const result = await resumeWhatsAppInboxWithOwnerAnswer({
    threadId: body.threadId,
    answerAr,
    answeredVia: 'room',
    scopeId: body.scopeId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  return NextResponse.json({ ok: true, threadId: result.threadId })
}
