import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { findRelatedForMail } from '@/lib/email/mail-intel'

export const dynamic = 'force-dynamic'

/** Best-effort related files / room posts / mail thread. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  try {
    const result = await findRelatedForMail(id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل البحث' },
      { status: 400 }
    )
  }
}
