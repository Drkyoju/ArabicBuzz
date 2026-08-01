import { NextResponse } from 'next/server'
import { acceptInviteByToken } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string
    displayNameAr?: string
    userId?: string
  }
  const token = String(body.token || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'رمز الدعوة مطلوب' }, { status: 400 })
  }
  const result = await acceptInviteByToken({
    token,
    displayNameAr: String(body.displayNameAr || '').trim(),
    userId: body.userId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    scopeId: result.scopeId,
    member: result.member,
    messageAr: `مرحباً ${result.member?.displayNameAr} — تم انضمامك للغرفة`,
  })
}
