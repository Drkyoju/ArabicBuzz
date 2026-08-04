import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/session'
import { uploadDriveTextFile } from '@/lib/google/drive'

export const dynamic = 'force-dynamic'

/** Save a canvas artifact into the company Drive brain folder. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json()) as {
      titleAr?: string
      content?: string
      type?: string
    }
    const content = String(body.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'لا محتوى للحفظ' }, { status: 400 })
    }
    const title = String(body.titleAr || 'مخرجات الوكيل').trim()
    const isCode = ['code', 'json', 'diff'].includes(String(body.type || ''))
    const ext = isCode ? (body.type === 'json' ? 'json' : 'txt') : 'md'
    const mime = isCode
      ? body.type === 'json'
        ? 'application/json'
        : 'text/plain'
      : 'text/markdown'
    const file = await uploadDriveTextFile(auth.user.id, {
      name: `${title}.${ext}`,
      content,
      mimeType: mime,
    })
    return NextResponse.json({
      file,
      messageAr: 'حُفظ في مجلد عقل الشركة على Drive',
      webViewLink: file.webViewLink || null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل الحفظ' },
      { status: 400 }
    )
  }
}
