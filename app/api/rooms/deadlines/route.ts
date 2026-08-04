import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import {
  SYSTEM_DEADLINE_KINDS,
  SYSTEM_DEADLINE_LABELS_AR,
  listSystemDeadlines,
  upcomingSystemDeadlines,
  upsertSystemDeadline,
  type SystemDeadlineKind,
} from '@/lib/rooms/system-deadlines'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const [all, upcoming] = await Promise.all([
    listSystemDeadlines(scopeId),
    upcomingSystemDeadlines(scopeId, 90),
  ])
  return NextResponse.json({
    kinds: SYSTEM_DEADLINE_KINDS.map((k) => ({
      id: k,
      labelAr: SYSTEM_DEADLINE_LABELS_AR[k],
    })),
    deadlines: all,
    upcoming,
    messageAr: 'مواعيد النظام على التقويم المشترك',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    kind?: string
    dateYmd?: string
    notesAr?: string
  }
  const kind = body.kind as SystemDeadlineKind
  if (!(SYSTEM_DEADLINE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: 'نوع الموعد غير معروف' },
      { status: 400 }
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.dateYmd || ''))) {
    return NextResponse.json(
      { error: 'التاريخ بصيغة YYYY-MM-DD' },
      { status: 400 }
    )
  }
  const result = await upsertSystemDeadline({
    scopeId: body.scopeId || 'shared-demo',
    kind,
    dateYmd: body.dateYmd!,
    notesAr: body.notesAr,
    createdBy: auth.user.id,
    createdByAr: auth.user.email || 'عضو',
  })
  return NextResponse.json(result)
}
