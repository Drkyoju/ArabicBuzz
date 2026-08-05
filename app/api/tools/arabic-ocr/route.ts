import { NextRequest, NextResponse } from 'next/server'
import { parseArabicDocument } from '@/lib/tools/arabic-ocr'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { fileUrl? , contentBase64? } — Arabic OCR / Marker-Surya parse. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    fileUrl?: string
    contentBase64?: string
  }
  const src = body.fileUrl || body.contentBase64
  if (!src) {
    return NextResponse.json(
      { error: 'يلزم fileUrl أو contentBase64' },
      { status: 400 }
    )
  }
  const result = await parseArabicDocument(src)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
