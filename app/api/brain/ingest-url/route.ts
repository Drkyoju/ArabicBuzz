import { requireRealUser } from '@/lib/auth/session'
import {
  ingestUrlToBrain,
  ingestUrlsToBrain,
} from '@/lib/tools/web-to-brain'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    url?: string
    urls?: string[]
    titleAr?: string
    titlePrefixAr?: string
  }
  const scopeId = body.scopeId?.trim() || 'shared-demo'
  const urls = [
    ...(body.urls || []),
    ...(body.url ? [body.url] : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean)

  if (!urls.length) {
    return Response.json(
      { error: 'يلزم url أو urls', messageAr: 'مرّر رابطاً واحداً على الأقل' },
      { status: 400 }
    )
  }
  if (urls.length > 20) {
    return Response.json(
      { error: 'حد أقصى ٢٠ رابطاً في الطلب الواحد' },
      { status: 400 }
    )
  }
  for (const u of urls) {
    if (u.length > 2048) {
      return Response.json({ error: 'رابط طويل جداً' }, { status: 400 })
    }
    try {
      const parsed = new URL(u)
      if (!/^https?:$/i.test(parsed.protocol)) {
        return Response.json(
          { error: 'يُقبل http/https فقط' },
          { status: 400 }
        )
      }
    } catch {
      return Response.json({ error: `رابط غير صالح: ${u.slice(0, 80)}` }, { status: 400 })
    }
  }

  if (urls.length === 1) {
    const result = await ingestUrlToBrain({
      scopeId,
      url: urls[0]!,
      titleAr: body.titleAr || body.titlePrefixAr,
    })
    return Response.json(result, { status: result.ok ? 200 : 422 })
  }

  const batch = await ingestUrlsToBrain({
    scopeId,
    urls,
    titlePrefixAr: body.titlePrefixAr || body.titleAr,
  })
  return Response.json(batch, { status: batch.ok ? 200 : 422 })
}
