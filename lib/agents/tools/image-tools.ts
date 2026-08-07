/**
 * Image edit for chat: sharp transforms + optional Gemini vision rewrite.
 */
import sharp from 'sharp'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'

const IMAGE_RE = /\.(png|jpe?g|webp|gif|tiff?)$/i

function geminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined
  )
}

function downloadMeta(
  scopeId: string,
  file: { id: string; originalName: string; mimeType: string }
) {
  const downloadPath = `/api/storage/file?id=${encodeURIComponent(file.id)}&scopeId=${encodeURIComponent(scopeId)}`
  return {
    fileId: file.id,
    name: file.originalName,
    mimeType: file.mimeType,
    downloadPath,
    downloadUrl: downloadPath,
    attachments: [
      {
        fileId: file.id,
        name: file.originalName,
        mimeType: file.mimeType,
        scopeId,
        downloadPath,
        edited: true,
      },
    ],
  }
}

async function saveEditedImage(opts: {
  scopeId: string
  sourceName: string
  sourceId: string
  buffer: Buffer
  mimeType: string
  outputName?: string
  replaceSource?: boolean
  ext: string
}) {
  const existing = await listWorkspaceFiles(opts.scopeId)
  let outputName = (opts.outputName || '').trim()
  let versionTag: string | null = null
  if (opts.replaceSource) {
    outputName = outputName || opts.sourceName
  } else if (!outputName) {
    const base = opts.sourceName.replace(/\.[^.]+$/, '')
    const next = nextVersionFileName(
      `${base}.${opts.ext}`,
      existing.map((f) => f.originalName)
    )
    outputName = next.fileName
    versionTag = next.versionTag
  } else if (!/\.[a-z0-9]+$/i.test(outputName)) {
    outputName = `${outputName}.${opts.ext}`
  }

  const saved = await saveWorkspaceFile({
    scopeId: opts.scopeId,
    buffer: opts.buffer,
    originalName: outputName,
    mimeType: opts.mimeType,
    replaceId: opts.replaceSource ? opts.sourceId : undefined,
    markEdited: true,
  })
  return { saved, versionTag }
}

/**
 * Local free edits: rotate / flip / resize / grayscale / blur / sharpen / text overlay.
 */
export async function executeEditImage(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.name || '').trim()
  if (!ref) throw new Error('مرّر fileId للصورة.')

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) throw new Error(`لم يُعثر على «${ref}».`)
  if (!IMAGE_RE.test(found.originalName) && !found.mimeType.startsWith('image/')) {
    throw new Error('edit_image يعمل على الصور (png/jpeg/webp/…).')
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  let pipeline = sharp(hit.buffer, { failOn: 'none' })

  const rotate =
    params.rotate != null ? Number(params.rotate) : undefined
  if (rotate && Number.isFinite(rotate)) {
    pipeline = pipeline.rotate(rotate)
  }
  if (params.flipHorizontal) pipeline = pipeline.flop()
  if (params.flipVertical) pipeline = pipeline.flip()
  if (params.grayscale || params.grey) pipeline = pipeline.grayscale()
  if (params.blur != null) {
    const b = Number(params.blur)
    if (b > 0) pipeline = pipeline.blur(Math.min(b, 20))
  }
  if (params.sharpen) pipeline = pipeline.sharpen()

  const width = params.width != null ? Number(params.width) : undefined
  const height = params.height != null ? Number(params.height) : undefined
  if ((width && width > 0) || (height && height > 0)) {
    pipeline = pipeline.resize({
      width: width && width > 0 ? Math.round(width) : undefined,
      height: height && height > 0 ? Math.round(height) : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Materialize transforms first so overlay SVG matches final pixel size.
  let working = await pipeline.png().toBuffer()
  const overlayText = String(params.overlayText || params.captionAr || '').trim()
  if (overlayText) {
    const meta = await sharp(working).metadata()
    const w = meta.width || 800
    const h = meta.height || 600
    const fontSize = Math.max(
      18,
      Math.min(48, Number(params.overlaySize) || Math.round(w / 28))
    )
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .t { fill: ${String(params.overlayColor || '#ffffff')}; font-size: ${fontSize}px;
               font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; direction: rtl; }
          .bg { fill: rgba(0,0,0,0.45); }
        </style>
        <rect class="bg" x="0" y="${h - fontSize * 2.2}" width="${w}" height="${fontSize * 2.2}" />
        <text class="t" x="${w - 24}" y="${h - fontSize * 0.7}" text-anchor="end">${escapeXml(overlayText.slice(0, 120))}</text>
      </svg>`
    )
    working = await sharp(working)
      .composite([{ input: svg, top: 0, left: 0 }])
      .png()
      .toBuffer()
  }

  const format = String(params.format || 'png').toLowerCase()
  let buffer: Buffer
  let mimeType: string
  let ext: string
  if (format === 'jpeg' || format === 'jpg') {
    buffer = await sharp(working).jpeg({ quality: 90 }).toBuffer()
    mimeType = 'image/jpeg'
    ext = 'jpg'
  } else if (format === 'webp') {
    buffer = await sharp(working).webp({ quality: 90 }).toBuffer()
    mimeType = 'image/webp'
    ext = 'webp'
  } else {
    buffer = await sharp(working).png().toBuffer()
    mimeType = 'image/png'
    ext = 'png'
  }

  const { saved, versionTag } = await saveEditedImage({
    scopeId,
    sourceName: found.originalName,
    sourceId: found.id,
    buffer,
    mimeType,
    outputName: params.outputName ? String(params.outputName) : undefined,
    replaceSource: Boolean(params.replaceSource),
    ext,
  })

  return {
    ok: true,
    ...downloadMeta(scopeId, saved.file),
    size: saved.file.size,
    versionTag,
    replaced: Boolean(params.replaceSource),
    method: 'sharp',
    messageAr: `عُدّلت الصورة «${saved.file.originalName}» — جاهزة للتنزيل في الشات.`,
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generative image rewrite via Gemini (free tier key) when user asks for
 * creative changes that sharp cannot do. Falls back with clear Arabic error.
 */
export async function executeGenerateImageEdit(
  _name: string,
  params: Record<string, unknown>
) {
  const key = geminiKey()
  if (!key) {
    throw new Error(
      'تعديل الصور التوليدي يحتاج GEMINI_API_KEY. استخدم edit_image للتدوير/التحجيم/النص.'
    )
  }

  const scopeId = String(params.scopeId || 'shared-demo')
  const prompt = String(
    params.promptAr || params.prompt || params.instructionAr || ''
  ).trim()
  if (!prompt) throw new Error('مرّر promptAr بوصف التعديل المطلوب.')

  const ref = String(params.fileId || params.name || '').trim()
  const parts: Array<Record<string, unknown>> = [
    {
      text: `عدّل هذه الصورة حسب الطلب التالي وأعد صورة واحدة فقط. الطلب: ${prompt}`,
    },
  ]

  if (ref) {
    const found = await findWorkspaceFile(scopeId, ref)
    if (!found) throw new Error(`لم يُعثر على «${ref}».`)
    const hit = await readWorkspaceFile(scopeId, found.id)
    const mime = hit.meta.mimeType.startsWith('image/')
      ? hit.meta.mimeType
      : 'image/png'
    parts.push({
      inlineData: {
        mimeType: mime,
        data: hit.buffer.toString('base64'),
      },
    })
  }

  const model =
    process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-2.0-flash-preview-image-generation'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Fallback path: try imagen-style or tell user to use sharp
    throw new Error(
      `تعذّر التعديل التوليدي (${res.status}). جرّب edit_image للتعديلات الأساسية. ${body.slice(0, 120)}`
    )
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
          inlineData?: { mimeType?: string; data?: string }
        }>
      }
    }>
  }

  const outParts = json.candidates?.[0]?.content?.parts || []
  const imgPart = outParts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) {
    const text = outParts.map((p) => p.text || '').join(' ').trim()
    throw new Error(
      text
        ? `النموذج لم يُرجع صورة: ${text.slice(0, 200)}`
        : 'النموذج لم يُرجع صورة. استخدم edit_image.'
    )
  }

  const mimeType = imgPart.inlineData.mimeType || 'image/png'
  const buffer = Buffer.from(imgPart.inlineData.data, 'base64')
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
  const sourceName = ref
    ? (await findWorkspaceFile(scopeId, ref))?.originalName || `صورة.${ext}`
    : `صورة-مولّدة.${ext}`
  const sourceId = ref
    ? (await findWorkspaceFile(scopeId, ref))?.id || ''
    : ''

  const { saved, versionTag } = await saveEditedImage({
    scopeId,
    sourceName,
    sourceId: sourceId || 'new',
    buffer,
    mimeType,
    outputName: params.outputName ? String(params.outputName) : undefined,
    replaceSource: Boolean(params.replaceSource) && Boolean(sourceId),
    ext,
  })

  return {
    ok: true,
    ...downloadMeta(scopeId, saved.file),
    size: saved.file.size,
    versionTag,
    method: 'gemini',
    messageAr: `أُنشئت صورة معدّلة «${saved.file.originalName}» — جاهزة في الشات.`,
  }
}
