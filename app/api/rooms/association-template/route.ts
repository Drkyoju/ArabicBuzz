import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { ASSOCIATION_ROLE_SLOTS } from '@/lib/rooms/association-template-data'
import { seedAssociationStarterDeadlines } from '@/lib/rooms/association-template'

export const dynamic = 'force-dynamic'

/** GET — template metadata (roles, labels). POST — seed starter deadlines for a scope. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    roles: ASSOCIATION_ROLE_SLOTS,
    messageAr:
      'قالب غرفة جمعية: مجلس · مدير تنفيذي · لجان · موظفون · متطوع · مدقق.',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    seedDeadlines?: boolean
  }
  const scopeId = body.scopeId?.trim()
  if (!scopeId) {
    return NextResponse.json(
      { error: 'يلزم scopeId' },
      { status: 400 }
    )
  }

  let deadlines = { seeded: 0, labelsAr: [] as string[] }
  if (body.seedDeadlines !== false) {
    deadlines = await seedAssociationStarterDeadlines({
      scopeId,
      createdBy: auth.user.id,
      createdByAr: auth.user.email || 'قالب الجمعية',
    })
  }

  return NextResponse.json({
    ok: true,
    scopeId,
    deadlines,
    messageAr:
      deadlines.seeded > 0
        ? `تم تجهيز ${deadlines.seeded} موعد نظامي ابتدائي — عدّل التواريخ من لوحة المواعيد.`
        : 'الغرفة جاهزة. المواعيد النظامية موجودة مسبقاً أو تعذّر إنشاؤها — راجع التقويم.',
  })
}
