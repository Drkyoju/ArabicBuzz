import { NextRequest, NextResponse } from 'next/server'
import { listPendingSkillProposals } from '@/lib/skills/persist'
import { requireWorkspaceOwner } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireWorkspaceOwner(
    req,
    'إدارة المهارات للمالك فقط.'
  )
  if (!auth.ok) return auth.response
  const proposals = await listPendingSkillProposals()
  return NextResponse.json({
    proposals: proposals.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      scope: s.scope,
      author: s.author,
      previewInstructions: s.systemInstructions.slice(0, 500),
      status: s.status || 'PENDING_REVIEW',
    })),
  })
}
