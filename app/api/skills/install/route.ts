import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getMarketplaceSkill } from '@/lib/skills/marketplace'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
import {
  ARABIC_AUTHZ_ERROR,
  assertPermission,
  AuthorizationError,
  SENSITIVE_ACTION_ROLES,
  withRlsContext,
} from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const body = await req.json()
    const skillId = String(body.skillId || '')
    const targetScopeId = String(body.targetScopeId || '')
    const userId = auth.user.id
    const orgId = String(body.orgId || '')

    if (!skillId || !targetScopeId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!orgId) {
      return NextResponse.json(
        { error: ARABIC_AUTHZ_ERROR, code: 'MISSING_TENANT_CONTEXT' },
        { status: 401 }
      )
    }
    if (
      skillId.includes('..') ||
      skillId.includes('/') ||
      targetScopeId.includes('..') ||
      targetScopeId.includes('/')
    ) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    await assertPermission(
      userId,
      orgId,
      SENSITIVE_ACTION_ROLES.installSkill
    )

    const skill = getMarketplaceSkill(skillId)
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    await withRlsContext({ userId, orgId }, async () => {
      const dir = path.join(process.cwd(), '.openclaw', 'skills')
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `${targetScopeId}-${skillId}.md`)
      fs.writeFileSync(filePath, skill.skillMarkdownContent, 'utf8')
    })

    return NextResponse.json({
      ok: true,
      message: 'تم تثبيت المهارة بنجاح وإضافتها إلى نطاق العمل.',
    })
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status }
      )
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 500 }
    )
  }
}
