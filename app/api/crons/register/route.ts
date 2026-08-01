import { requireUser } from '@/lib/auth/session'
import {
  arabicMorningToCron,
  registerScheduledTask,
} from '@/lib/cron/register'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json()) as {
      scopeId?: string
      nameAr?: string
      prompt?: string
      cronExpr?: string
      hour?: number
      notifyChannels?: string[]
      timezone?: string
    }

    const nameAr = String(body.nameAr || '').trim()
    const prompt = String(body.prompt || '').trim()
    if (!nameAr || !prompt) {
      return Response.json(
        { error: 'nameAr و prompt مطلوبان' },
        { status: 400 }
      )
    }

    const hour =
      typeof body.hour === 'number' && body.hour >= 0 && body.hour <= 23
        ? body.hour
        : 9
    const cronExpr =
      String(body.cronExpr || '').trim() || arabicMorningToCron(hour)

    const task = await registerScheduledTask({
      scopeId: body.scopeId || 'shared-ops',
      nameAr,
      prompt,
      cronExpr,
      notifyChannels: Array.isArray(body.notifyChannels)
        ? body.notifyChannels
        : ['telegram'],
      timezone: body.timezone || 'Asia/Riyadh',
    })

    return Response.json({
      ok: true,
      task,
      cronExpr,
      messageAr: `سُجّلت «${nameAr}» · ${cronExpr} (توقيت الرياض)`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشل تسجيل المهمة' },
      { status: 500 }
    )
  }
}
