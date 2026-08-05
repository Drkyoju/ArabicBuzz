import { NextRequest, NextResponse } from 'next/server'
import {
  buildDirectorDigestAr,
  isDirectorDigestDay,
  sendDirectorWeeklyDigest,
} from '@/lib/digest/director-weekly'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  if (secret && secret !== 'change-me') {
    return header === `Bearer ${secret}` || alt === secret
  }
  const digest = process.env.DIGEST_CRON_SECRET || ''
  if (digest) return header === `Bearer ${digest}` || alt === digest
  return false
}

/**
 * Weekly director digest: ما ينتظر قرارك
 * Call with CRON_SECRET. Pass force=1 to send any day.
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean
    scopeId?: string
    toEmail?: string
    nameAr?: string
    channels?: Array<'email' | 'telegram'>
  }
  const force =
    body.force === true || req.nextUrl.searchParams.get('force') === '1'

  if (!force && !isDirectorDigestDay()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      messageAr:
        'الملخص الأسبوعي يُرسل يوم الخميس (توقيت الرياض). مرّر force=1 للإرسال الآن.',
    })
  }

  const result = await sendDirectorWeeklyDigest({
    scopeId: body.scopeId || 'shared-demo',
    toEmail: body.toEmail,
    nameAr: body.nameAr,
    channels: body.channels,
  })

  return NextResponse.json({
    ...result,
    messageAr: result.ok
      ? `أُرسل ملخص «ما ينتظر قرارك»${result.emailSent ? ' بالبريد' : ''}${result.telegramSent ? ' وتيليجرام' : ''}.`
      : result.error || 'تعذّر الإرسال',
  })
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const previewAr = await buildDirectorDigestAr({
    scopeId: req.nextUrl.searchParams.get('scopeId') || 'shared-demo',
  })
  return NextResponse.json({
    digestDay: isDirectorDigestDay(),
    previewAr,
  })
}
