import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { forbidOrgMailIfMember } from '@/lib/email/org-mail-access'
import { askAboutMailMessage } from '@/lib/email/mail-intel'
import { warmProviderKeyCache } from '@/lib/ai/provider-key-store'

export const dynamic = 'force-dynamic'

/** Ask a question scoped to this email + attachment text. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const denied = forbidOrgMailIfMember(auth.user)
  if (denied) return denied

  const { id } = await ctx.params
  let question = ''
  try {
    const body = await req.json()
    question = String(body?.question || body?.q || '').trim()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح.' }, { status: 400 })
  }

  try {
    await warmProviderKeyCache().catch(() => null)
    const result = await askAboutMailMessage({ messageId: id, question })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل السؤال' },
      { status: 400 }
    )
  }
}
