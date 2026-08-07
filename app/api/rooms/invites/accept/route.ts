import { NextResponse } from 'next/server'
import { acceptInviteByToken } from '@/lib/rooms/persist'
import { requireRealUser } from '@/lib/auth/session'
import {
  displayNameFromUser,
  looksLikeEmailLabel,
} from '@/lib/auth/display-name'

export const dynamic = 'force-dynamic'

const MAX_TOKEN_LENGTH = 128
const MAX_DISPLAY_NAME_LENGTH = 80

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json()) as {
    token?: string
    displayNameAr?: string
    userId?: string
  }
  const token = String(body.token || '').trim()
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'رمز الدعوة مطلوب' }, { status: 400 })
  }
  const fromBody = String(body.displayNameAr || '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
  const fromGoogle = displayNameFromUser(auth.user, '')
  const displayNameAr =
    fromBody && !looksLikeEmailLabel(fromBody, auth.user.email)
      ? fromBody
      : fromGoogle || fromBody
  const result = await acceptInviteByToken({
    token,
    displayNameAr,
    userId: auth.user.id,
    email: auth.user.email,
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
