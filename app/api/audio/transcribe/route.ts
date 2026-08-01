import { requireUser } from '@/lib/auth/session'
import { transcribeArabicSpeech } from '@/lib/audio/transcribe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Browser mic → free Arabic/Saudi STT cascade → transcript text.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  try {
    const { warmProviderKeyCache } = await import('@/lib/ai/provider-key-store')
    await warmProviderKeyCache()

    const contentType = req.headers.get('content-type') || ''
    let buffer: Buffer
    let mimeType = 'audio/webm'

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') ?? form.get('audio')
      if (!(file instanceof File)) {
        return Response.json(
          { error: 'أرسل ملفًا صوتيًا في الحقل file' },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type || mimeType
    } else {
      const body = (await req.json()) as {
        contentBase64?: string
        mimeType?: string
      }
      if (!body.contentBase64) {
        return Response.json(
          { error: 'contentBase64 مطلوب' },
          { status: 400 }
        )
      }
      buffer = Buffer.from(body.contentBase64, 'base64')
      mimeType = body.mimeType || mimeType
    }

    if (buffer.length > 25 * 1024 * 1024) {
      return Response.json(
        { error: 'الملف الصوتي كبير جداً (الحد 25MB)' },
        { status: 413 }
      )
    }

    const result = await transcribeArabicSpeech(buffer, mimeType)
    return Response.json({
      ok: true,
      text: result.text,
      provider: result.provider,
      providerLabelAr: result.providerLabelAr,
      messageAr: `تم النسخ عبر ${result.providerLabelAr}`,
    })
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : 'تعذّر تحويل الصوت إلى نص',
      },
      { status: 500 }
    )
  }
}
