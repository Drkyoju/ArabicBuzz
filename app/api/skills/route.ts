import { NextRequest, NextResponse } from 'next/server'
import {
  loadAllOpenClawSkills,
  parseSkillFile,
  saveSkillToWorkspace,
  serializeOpenClawSkill,
} from '@/lib/skills/openclaw'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope')
  let skills = loadAllOpenClawSkills()
  if (scope === 'personal' || scope === 'shared') {
    skills = skills.filter((s) => s.scope === scope)
  }
  return NextResponse.json({ skills })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    let skill
    if (typeof body.content === 'string') {
      skill = parseSkillFile(body.content)
    } else {
      skill = {
        id: String(body.id || body.name),
        name: String(body.name),
        description: String(body.description || body.name),
        scope: body.scope === 'personal' ? 'personal' : 'shared',
        author: body.author,
        systemInstructions: String(body.systemInstructions || body.body || ''),
        toolsRequired: body.toolsRequired,
      } as const
      if (skill.id.includes('..') || skill.id.includes('/')) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
      }
    }
    const path = saveSkillToWorkspace(skill)
    return NextResponse.json(
      { skill, path, serialized: serializeOpenClawSkill(skill) },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 400 }
    )
  }
}
