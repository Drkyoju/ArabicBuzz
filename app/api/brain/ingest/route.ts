import { requireRealUser } from '@/lib/auth/session'
import {
  extractDocumentText,
  ingestArabicDocument,
} from '@/lib/rag/ingest'
import { readLocalFile } from '@/lib/storage/local'
import { readCloudFile } from '@/lib/storage/cloud'
import { insertRoomPost } from '@/lib/rooms/persist'
import {
  isBrainPrimaryMac,
  macBrainIngest,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Ingest Word / PowerPoint / PDF / images into company brain.
 * When BRAIN_PRIMARY=mac (or sensitive/macOnly), text is stored only on the Mac vault.
 */
export async function POST(req: Request) {
  const auth = await requireRealUser(req)
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
    let sensitive = false

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      scopeId = String(form.get('scopeId') || scopeId)
      titleAr = String(form.get('titleAr') || titleAr)
      sensitive =
        String(form.get('sensitive') || form.get('macOnly') || '') === '1' ||
        String(form.get('sensitive') || '').toLowerCase() === 'true'
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
        sensitive?: boolean
        macOnly?: boolean
      }
      scopeId = body.scopeId || scopeId
      titleAr = body.titleAr || titleAr
      sensitive = Boolean(body.sensitive || body.macOnly)
      if (body.text?.trim()) {
        text = body.text
        extractMethod = 'plain'
      } else if (body.localFileId) {
        if ((isBrainPrimaryMac() || sensitive) && macSyncConfigured()) {
          const { getMacSyncConfig } = await import(
            '@/lib/storage/mac-sync-client'
          )
          const { baseUrl, secret } = getMacSyncConfig()
          const res = await fetch(`${baseUrl}/brain/ingest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
            },
            body: JSON.stringify({
              scopeId,
              titleAr,
              localFileId: body.localFileId,
            }),
          })
          const data = (await res.json()) as {
            ok?: boolean
            chunks?: number
            error?: string
            messageAr?: string
          }
          if (!res.ok || !data.ok) {
            return Response.json(
              { error: data.error || 'فشل الاستيعاب على الماك' },
              { status: 502 }
            )
          }
          await insertRoomPost({
            scopeId,
            authorKind: 'system',
            authorId: 'company-brain',
            authorNameAr: 'عقل الشركة',
            content: `🧠 أُضيف «${titleAr}» إلى عقل الماك (${data.chunks} مقطع).`,
          })
          return Response.json({
            ok: true,
            chunks: data.chunks,
            primary: 'mac',
            messageAr:
              data.messageAr ||
              `تم الاستيعاب على الماك (${data.chunks} مقطع)`,
          })
        }

        if (sensitive && !macSyncConfigured()) {
          return Response.json(
            {
              error:
                'المستند حساس ويتطلب وكيل الماك. لا يُستوعب في السحابة.',
            },
            { status: 503 }
          )
        }

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

    const macOnly = isBrainPrimaryMac() || sensitive
    if (macOnly) {
      if (!macSyncConfigured()) {
        return Response.json(
          {
            error: sensitive
              ? 'المستند حساس ويتطلب وكيل الماك. لا يُستوعب في السحابة.'
              : 'BRAIN_PRIMARY=mac لكن MAC_SYNC_URL غير مضبوط. شغّل وكيل الماك والنفق.',
          },
          { status: 503 }
        )
      }
      const data = await macBrainIngest({
        scopeId,
        titleAr,
        content: text,
        sourceFileId,
        sourcePath,
      })
      const ocrNote = ocrUsed
        ? ` · OCR عبر ${ocrProvider || extractMethod}`
        : ` · استخراج ${extractMethod || 'نصي'}`
      await insertRoomPost({
        scopeId,
        authorKind: 'system',
        authorId: 'company-brain',
        authorNameAr: 'عقل الشركة',
        content: `🧠 أُضيف «${titleAr}» إلى عقل الماك (${data.chunks} مقطع)${ocrNote}.`,
      })
      return Response.json({
        ok: true,
        chunks: data.chunks,
        primary: 'mac',
        method: extractMethod,
        ocrUsed,
        ocrProvider: ocrProvider || null,
        messageAr: `تم استيعاب ${data.chunks} مقطع على الماك${ocrNote}`,
      })
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
