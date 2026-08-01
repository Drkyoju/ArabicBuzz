import { requireUser } from '@/lib/auth/session'
import {
  extractDocumentText,
  ingestArabicDocument,
} from '@/lib/rag/ingest'
import { readLocalFile } from '@/lib/storage/local'
import { readCloudFile } from '@/lib/storage/cloud'
import { insertRoomPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Ingest Word / PowerPoint / PDF / images into company brain (Arabic hybrid RAG).
 * Uses native text extract first; Arabic OCR (Qari → Gemini) for scans/images.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  try {
    const contentType = req.headers.get('content-type') || ''
    let scopeId = 'shared-demo'
    let titleAr = 'مستند الشركة'
    let text = ''
    let extractMethod = ''
    let ocrUsed = false
    let ocrProvider = ''
    let sourceFileId: string | undefined
    let sourcePath: string | undefined

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      scopeId = String(form.get('scopeId') || scopeId)
      titleAr = String(form.get('titleAr') || titleAr)
      const file = form.get('file')
      if (file instanceof File) {
        const buf = Buffer.from(await file.arrayBuffer())
        titleAr = titleAr === 'مستند الشركة' ? file.name : titleAr
        const extracted = await extractDocumentText({
          buffer: buf,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          enableOcr: true,
        })
        text = extracted.text
        extractMethod = extracted.method
        ocrUsed = extracted.ocrUsed
        ocrProvider = extracted.ocrProvider || ''
        sourcePath = file.name
      }
    } else {
      const body = (await req.json()) as {
        scopeId?: string
        titleAr?: string
        text?: string
        localFileId?: string
      }
      scopeId = body.scopeId || scopeId
      titleAr = body.titleAr || titleAr
      if (body.text?.trim()) {
        text = body.text
        extractMethod = 'plain'
      } else if (body.localFileId) {
        let local: Awaited<ReturnType<typeof readCloudFile>> = null
        try {
          local = readLocalFile(scopeId, body.localFileId)
        } catch {
          local = null
        }
        if (!local) {
          local = await readCloudFile(scopeId, body.localFileId)
        }
        if (!local) {
          return Response.json(
            { error: 'الملف غير موجود (ماك أو سحابة)' },
            { status: 404 }
          )
        }
        sourceFileId = local.meta.id
        sourcePath = local.meta.relativePath
        titleAr = body.titleAr || local.meta.originalName
        const extracted = await extractDocumentText({
          buffer: local.buffer,
          filename: local.meta.originalName,
          mimeType: local.meta.mimeType,
          enableOcr: true,
        })
        text = extracted.text
        extractMethod = extracted.method
        ocrUsed = extracted.ocrUsed
        ocrProvider = extracted.ocrProvider || ''
      }
    }

    if (!text.trim()) {
      return Response.json(
        {
          error:
            'تعذّر استخراج النص. جرّب Word/PowerPoint/PDF نصي، أو صورة واضحة مع تفعيل OCR (GEMINI_API_KEY أو HF_TOKEN لـ Qari).',
        },
        { status: 400 }
      )
    }

    const result = await ingestArabicDocument({
      scopeId,
      titleAr,
      content: text,
      sourceFileId,
      sourcePath,
    })

    if (!result.ok) {
      return Response.json(
        { error: result.error || 'فشل الاستيعاب' },
        { status: 500 }
      )
    }

    const ocrNote = ocrUsed
      ? ` · OCR عربي عبر ${ocrProvider || extractMethod}`
      : ` · استخراج ${extractMethod || 'نصي'}`

    await insertRoomPost({
      scopeId,
      authorKind: 'system',
      authorId: 'company-brain',
      authorNameAr: 'عقل الشركة',
      content: `🧠 أُضيف «${titleAr}» إلى قاعدة المعرفة (${result.chunks} مقطع)${ocrNote}. يمكن للوكلاء البحث عنه.`,
    })

    return Response.json({
      ok: true,
      chunks: result.chunks,
      method: extractMethod,
      ocrUsed,
      ocrProvider: ocrProvider || null,
      messageAr: `تم استيعاب ${result.chunks} مقطع في عقل الشركة${ocrNote}`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'خطأ في الاستيعاب' },
      { status: 500 }
    )
  }
}
