import { NextRequest, NextResponse } from 'next/server'
import { executeArabicOcr } from '@/lib/agents/tools/arabic-ocr-tool'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { fileId?, fileUrl?, contentBase64?, scopeId?, searchQuery?, saveToMemory?, saveAsFile? } */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    fileId?: string
    fileUrl?: string
    contentBase64?: string
    scopeId?: string
    searchQuery?: string
    saveToMemory?: boolean
    saveAsFile?: boolean
  }
  if (!body.fileId && !body.fileUrl && !body.contentBase64) {
    return NextResponse.json(
      { error: 'يلزم fileId أو fileUrl أو contentBase64' },
      { status: 400 }
    )
  }
  try {
    const result = await executeArabicOcr('arabic_ocr', {
      ...body,
      scopeId: body.scopeId || 'shared-demo',
      userId: auth.user?.id,
    })
    return NextResponse.json(result, {
      status: (result as { ok?: boolean }).ok ? 200 : 502,
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'OCR failed',
      },
      { status: 500 }
    )
  }
}
