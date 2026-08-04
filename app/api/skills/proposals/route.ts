import { NextResponse } from 'next/server'
import { listPendingSkillProposals } from '@/lib/skills/persist'

export const dynamic = 'force-dynamic'

export async function GET() {
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
