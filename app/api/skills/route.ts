import { NextRequest, NextResponse } from 'next/server'
import { parseSkillFile } from '@/lib/skills/openclaw'
import {
  loadAllSkillsMerged,
  persistSkill,
  deletePersistedSkill,
  serializeOpenClawSkill,
} from '@/lib/skills/persist'
import { requireWorkspaceOwner } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const MAX_CONTENT_LENGTH = 50_000
const OWNER_ONLY_AR = 'إدارة المهارات للمالك فقط.'

function slugifyName(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  if (base) return base
  return `skill-${Date.now().toString(36)}`
}

/** Catalog browse/manage — owner UI only. Workers load skills server-side via registry. */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspaceOwner(req, OWNER_ONLY_AR)
  if (!auth.ok) return auth.response
  const scope = req.nextUrl.searchParams.get('scope')
  let skills = await loadAllSkillsMerged()
  if (scope === 'personal' || scope === 'shared') {
    skills = skills.filter((s) => s.scope === scope)
  }
  return NextResponse.json({ skills })
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspaceOwner(req, OWNER_ONLY_AR)
  if (!auth.ok) return auth.response
  try {
    const body = await req.json()
    if (
      typeof body.content === 'string' &&
      body.content.length > MAX_CONTENT_LENGTH
    ) {
      return NextResponse.json(
        { error: 'محتوى المهارة طويل جدًا' },
        { status: 400 }
      )
    }
    const rawInstructions = String(body.systemInstructions || body.body || '')
    if (rawInstructions.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: 'تعليمات المهارة طويلة جدًا' },
        { status: 400 }
      )
    }
    let skill
    if (typeof body.content === 'string') {
      skill = parseSkillFile(body.content)
    } else {
      const name = String(body.name || '').trim()
      if (!name) {
        return NextResponse.json(
          { error: 'الاسم مطلوب — اكتب الاسم اللي تبيه' },
          { status: 400 }
        )
      }
      const id = String(body.id || slugifyName(name))
      if (id.includes('..') || id.includes('/')) {
        return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
      }
      skill = {
        id,
        name,
        description: String(body.description || name).trim(),
        scope: body.scope === 'personal' ? 'personal' : 'shared',
        author: body.author ? String(body.author) : undefined,
        systemInstructions: rawInstructions.trim(),
        toolsRequired: body.toolsRequired,
      } as const
    }
    await persistSkill(skill)
    return NextResponse.json(
      { skill, serialized: serializeOpenClawSkill(skill) },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 400 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWorkspaceOwner(req, OWNER_ONLY_AR)
  if (!auth.ok) return auth.response
  try {
    const id =
      req.nextUrl.searchParams.get('id')?.trim() ||
      String((await req.json().catch(() => ({}))).id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'معرّف المهارة مطلوب' }, { status: 400 })
    }
    const ok = await deletePersistedSkill(id)
    if (!ok) {
      return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, messageAr: 'تم حذف المهارة' })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 400 }
    )
  }
}
