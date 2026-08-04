import { NextRequest, NextResponse } from 'next/server'
import {
  deletePersistedSkill,
  setSkillStatus,
} from '@/lib/skills/persist'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as {
      decision?: 'APPROVE' | 'REJECT'
      editedInstructions?: string
    }
    if (!id) {
      return NextResponse.json({ error: 'معرّف مطلوب' }, { status: 400 })
    }
    if (body.decision === 'REJECT') {
      await deletePersistedSkill(id)
      return NextResponse.json({
        ok: true,
        messageAr: 'رُفض الاقتراح وحُذف.',
      })
    }
    if (body.decision !== 'APPROVE') {
      return NextResponse.json({ error: 'قرار غير صالح' }, { status: 400 })
    }
    if (body.editedInstructions?.trim()) {
      const { persistSkill, loadPersistedSkills } = await import(
        '@/lib/skills/persist'
      )
      const pending = await loadPersistedSkills({ status: 'PENDING_REVIEW' })
      const found = pending.find((s) => s.id === id)
      if (!found) {
        return NextResponse.json({ error: 'الاقتراح غير موجود' }, { status: 404 })
      }
      found.systemInstructions = body.editedInstructions.trim()
      await persistSkill(found, { status: 'ACTIVE' })
      return NextResponse.json({
        ok: true,
        skill: found,
        messageAr: `أُضيفت المهارة «${found.name}» بعد اعتمادك.`,
      })
    }
    const skill = await setSkillStatus(id, 'ACTIVE')
    if (!skill) {
      return NextResponse.json({ error: 'الاقتراح غير موجود' }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      skill,
      messageAr: `أُضيفت المهارة «${skill.name}» بعد اعتمادك.`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل' },
      { status: 400 }
    )
  }
}
