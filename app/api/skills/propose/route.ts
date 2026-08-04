import { NextRequest, NextResponse } from 'next/server'
import { distillThreadToSkill, type ThreadMessage } from '@/lib/ai/hermes'
import { persistSkill } from '@/lib/skills/persist'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const MAX_MESSAGES_CHARS = 80_000

/** Propose a skill from a conversation — saved as PENDING_REVIEW until approved. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const body = (await req.json()) as {
      threadMessages?: ThreadMessage[]
      scope?: 'personal' | 'shared'
      nameHintAr?: string
    }
    const messages = Array.isArray(body.threadMessages)
      ? body.threadMessages.filter(
          (m) =>
            m &&
            typeof m.content === 'string' &&
            (m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        )
      : []
    if (messages.length < 1) {
      return NextResponse.json(
        { error: 'أضف رسالة واحدة على الأقل من المحادثة' },
        { status: 400 }
      )
    }
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    if (totalChars > MAX_MESSAGES_CHARS) {
      return NextResponse.json(
        { error: 'المحادثة طويلة جدًا لإنشاء مهارة منها' },
        { status: 400 }
      )
    }
    const skill = await distillThreadToSkill(messages.slice(-12), {
      scope: body.scope === 'personal' ? 'personal' : 'shared',
      persist: false,
    })
    if (body.nameHintAr?.trim()) {
      skill.name = body.nameHintAr.trim().slice(0, 80)
    }
    skill.id = `proposal-${Date.now().toString(36)}`
    await persistSkill(skill, { status: 'PENDING_REVIEW' })
    return NextResponse.json(
      {
        proposalId: skill.id,
        skill,
        status: 'PENDING_REVIEW',
        messageAr: 'أُنشئ اقتراح المهارة — اعتمده من قسم المهارات.',
      },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل الاقتراح' },
      { status: 400 }
    )
  }
}
