/**
 * POST: archive recoverable Telegram group media → Drive (+ room/Mac mesh).
 * Also attempts pending معلم أول PDF job when bytes found.
 *
 * Auth: CRON_SECRET bearer OR signed-in real user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import {
  archiveTelegramGroupToDrive,
  resolveAndRunPendingPdfJob,
} from '@/lib/telegram/group-archive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function cronOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  if (!secret || secret === 'change-me') return false
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  return header === `Bearer ${secret}` || alt === secret
}

export async function POST(req: NextRequest) {
  if (!cronOk(req)) {
    const auth = await requireRealUser(req)
    if (!auth.ok) return auth.response
  }

  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string
    scopeId?: string
    syncRoom?: boolean
    syncMac?: boolean
    runPendingPdf?: boolean
  }

  const archive = await archiveTelegramGroupToDrive({
    chatId: body.chatId,
    scopeId: body.scopeId,
    syncRoom: body.syncRoom,
    syncMac: body.syncMac,
  })

  let pendingPdf: unknown = null
  if (body.runPendingPdf !== false) {
    pendingPdf = await resolveAndRunPendingPdfJob({
      jobId: '96dee180-e828-49db-a2df-0d3a411e90a6',
      chatId: body.chatId || archive.chatId,
      scopeId: body.scopeId || archive.scopeId,
      findEmptyPage: true,
      afterPage: 45,
      queryNames: [
        'المعلم الاول',
        'المعلم الأول',
        'المعلم الأول من معالم من السيرة النبوية',
        'المعلم الاول من معالم من السيرة النبوية',
        'المعلم الأول.pdf',
        'المعلم الاول.pdf',
      ],
    })
  }

  return NextResponse.json({
    ok: true,
    archive,
    pendingPdf,
    deepHistoryStatus: archive.deepHistoryStatus,
    messageAr: [
      archive.messageAr,
      pendingPdf &&
      typeof pendingPdf === 'object' &&
      pendingPdf &&
      'ok' in pendingPdf &&
      (pendingPdf as { ok: boolean }).ok
        ? `أُكملت مهمة نسخ صفحة فاضية وأُرسل الملف للمجموعة${
            typeof (pendingPdf as unknown as { emptySourcePage?: number })
              .emptySourcePage === 'number'
              ? ` (المصدر ص ${(pendingPdf as unknown as { emptySourcePage: number }).emptySourcePage}).`
              : '.'
          }`
        : typeof pendingPdf === 'object' &&
            pendingPdf &&
            'errorAr' in pendingPdf &&
            String((pendingPdf as unknown as { errorAr?: string }).errorAr || '')
          ? String((pendingPdf as unknown as { errorAr: string }).errorAr)
          : 'مهمة المعلم الأول ما زالت معلّقة صامتة إن لم تُوجد البايتات بعد.',
      archive.deepHistory?.credentialsReady === false
        ? archive.deepHistoryStatus.setupAr
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
