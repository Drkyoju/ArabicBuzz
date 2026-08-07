import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { forbidOrgMailIfMember } from '@/lib/email/org-mail-access'
import { analyzeMailMessage } from '@/lib/email/mail-intel'
import { warmProviderKeyCache } from '@/lib/ai/provider-key-store'

export const dynamic = 'force-dynamic'

/** Agent: summary + draft reply + structured extract for one message. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const denied = forbidOrgMailIfMember(auth.user)
  if (denied) return denied

  const { id } = await ctx.params
  let force = false
  try {
    const body = await req.json()
    force = body?.force === true
  } catch {
    /* empty body ok */
  }

  try {
    await warmProviderKeyCache().catch(() => null)
    const result = await analyzeMailMessage(id, { force })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل تحليل الرسالة' },
      { status: 400 }
    )
  }
}
