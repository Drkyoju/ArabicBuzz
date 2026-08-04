import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import {
  COMMITTEE_KEYS,
  COMMITTEE_LABELS_AR,
  committeeDeepLinkPath,
  listCommitteeChannels,
  removeCommitteeChannel,
  upsertCommitteeChannel,
  type CommitteeKey,
} from '@/lib/rooms/committee-channels'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const channels = await listCommitteeChannels(scopeId)
  const botBase =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/alhuda14bot'
  return NextResponse.json({
    committees: COMMITTEE_KEYS.map((k) => ({
      key: k,
      labelAr: COMMITTEE_LABELS_AR[k],
      deepLink: `${botBase.replace(/\/$/, '')}?start=${encodeURIComponent(committeeDeepLinkPath(scopeId, k))}`,
      bound: channels.find((c) => c.committeeKey === k) || null,
    })),
    channels,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    committeeKey?: string
    chatId?: string
    nameAr?: string
    action?: 'upsert' | 'remove'
  }
  const scopeId = body.scopeId || 'shared-demo'
  const key = body.committeeKey as CommitteeKey
  if (!(COMMITTEE_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: 'لجنة غير معروفة' }, { status: 400 })
  }
  if (body.action === 'remove') {
    await removeCommitteeChannel({ scopeId, committeeKey: key })
    return NextResponse.json({
      ok: true,
      messageAr: `أُزيل ربط ${COMMITTEE_LABELS_AR[key]}`,
    })
  }
  const result = await upsertCommitteeChannel({
    scopeId,
    committeeKey: key,
    chatId: String(body.chatId || ''),
    nameAr: body.nameAr,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    channel: result.channel,
    messageAr: `رُبطت ${COMMITTEE_LABELS_AR[key]} بالغرفة`,
    warning: result.error,
  })
}
