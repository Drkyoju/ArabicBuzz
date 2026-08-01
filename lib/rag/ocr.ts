/**
 * Arabic document OCR for scanned PDFs / images.
 *
 * OCR vs RAG (short):
 * - OCR = قراءة النص من صورة أو PDF ممسوح
 * - RAG = تخزين ذلك النص والبحث فيه لاحقاً عند سؤال الوكيل
 *
 * Free Arabic-first model people cite on GitHub/HF:
 *   NAMAA-Space/Qari-OCR (QARI) — open-source Arabic VLM OCR
 * Optional local stack: Manazir-OCR wrapping Qari + others.
 *
 * Cascade:
 * 1) QARI_OCR_URL — your Mac/local Manazir/Qari HTTP endpoint
 * 2) Hugging Face Inference (HF_TOKEN) — Qari model
 * 3) Gemini vision (GEMINI_API_KEY) — strong Arabic OCR fallback on Netlify
 */
import { generateText } from 'ai'
import { getCloudProviders } from '@/lib/ai/providers'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export type ArabicOcrResult = {
  text: string
  provider: 'qari-local' | 'qari-hf' | 'gemini' | 'none'
  error?: string
}

const ARABIC_OCR_PROMPT = `استخرج كل النص العربي والإنجليزي الظاهر في هذه الصفحة/الصورة بدقة عالية.
- حافظ على ترتيب القراءة من اليمين لليسار للعربية.
- أعد النص فقط بدون شرح أو تعليقات.
- إن وُجدت جداول، حوّلها إلى نص منظم بفواصل واضحة.
- لا تختلق محتوى غير ظاهر في الصورة.`

const DEFAULT_QARI_MODEL =
  process.env.QARI_OCR_MODEL ||
  'NAMAA-Space/Qari-OCR-v0.3-VL-2B-Instruct'

function looksLikeImage(mime: string, filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|tif{1,2}|bmp)$/i.test(lower)
  )
}

function looksLikePdf(mime: string, filename: string): boolean {
  return mime.includes('pdf') || filename.toLowerCase().endsWith('.pdf')
}

async function ocrViaLocalQari(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  const base = (process.env.QARI_OCR_URL || '').replace(/\/$/, '')
  if (!base) return null
  const secret = process.env.QARI_OCR_SECRET?.trim() || ''
  try {
    const res = await fetch(`${base}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        filename,
        mimeType: mime,
        contentBase64: buffer.toString('base64'),
        model: DEFAULT_QARI_MODEL,
      }),
    })
    if (!res.ok) {
      return {
        text: '',
        provider: 'qari-local',
        error: `Qari local HTTP ${res.status}`,
      }
    }
    const data = (await res.json()) as { text?: string; error?: string }
    return {
      text: (data.text || '').trim(),
      provider: 'qari-local',
      error: data.error,
    }
  } catch (e) {
    return {
      text: '',
      provider: 'qari-local',
      error: e instanceof Error ? e.message : 'qari-local failed',
    }
  }
}

async function ocrViaHuggingFaceQari(
  buffer: Buffer,
  mime: string
): Promise<ArabicOcrResult | null> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY
  if (!token) return null
  if (!mime.startsWith('image/') && !mime.includes('pdf')) return null

  // Prefer image inputs for Qari; PDF may fail on some HF routers
  if (!mime.startsWith('image/')) return null

  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
  const endpoints = [
    'https://router.huggingface.co/v1/chat/completions',
    'https://api-inference.huggingface.co/v1/chat/completions',
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_QARI_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: ARABIC_OCR_PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0,
        }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = json.choices?.[0]?.message?.content?.trim() || ''
      if (text) return { text, provider: 'qari-hf' }
    } catch {
      /* try next */
    }
  }
  return { text: '', provider: 'qari-hf', error: 'Qari HF لم يُرجع نصاً' }
}

async function ocrViaGemini(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult> {
  if (IS_AIR_GAPPED_MODE || !process.env.GEMINI_API_KEY) {
    return {
      text: '',
      provider: 'none',
      error: 'لا يتوفر مزوّد OCR (اضبط QARI_OCR_URL أو HF_TOKEN أو GEMINI_API_KEY)',
    }
  }

  try {
    const { google } = getCloudProviders()
    const modelId = process.env.OCR_GEMINI_MODEL || 'gemini-2.0-flash'
    const isImage = looksLikeImage(mime, filename)
    const isPdf = looksLikePdf(mime, filename)

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; image: Buffer }
      | { type: 'file'; data: Buffer; mediaType: string }
    > = [{ type: 'text', text: ARABIC_OCR_PROMPT }]

    if (isImage) {
      content.push({ type: 'image', image: buffer })
    } else if (isPdf) {
      content.push({
        type: 'file',
        data: buffer,
        mediaType: 'application/pdf',
      })
    } else {
      content.push({ type: 'image', image: buffer })
    }

    const result = await generateText({
      model: google(modelId),
      messages: [{ role: 'user', content }],
    })

    return { text: (result.text || '').trim(), provider: 'gemini' }
  } catch (e) {
    return {
      text: '',
      provider: 'gemini',
      error: e instanceof Error ? e.message : 'gemini ocr failed',
    }
  }
}

/** Run Arabic OCR cascade on an image or scanned PDF. */
export async function runArabicOcr(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
}): Promise<ArabicOcrResult> {
  const mime = opts.mimeType || 'application/octet-stream'
  const filename = opts.filename || 'document.bin'

  const local = await ocrViaLocalQari(opts.buffer, mime, filename)
  if (local && local.text) return local

  const hf = await ocrViaHuggingFaceQari(opts.buffer, mime)
  if (hf && hf.text) return hf

  return ocrViaGemini(opts.buffer, mime, filename)
}

export function shouldRunOcr(opts: {
  extractedText: string
  filename: string
  mimeType: string
  byteLength: number
}): boolean {
  const { extractedText, filename, mimeType, byteLength } = opts
  const lower = filename.toLowerCase()
  const isVisual =
    looksLikeImage(mimeType, filename) ||
    looksLikePdf(mimeType, filename) ||
    /\.(png|jpe?g|webp|tif{1,2})$/i.test(lower)

  if (!isVisual) return false
  if (looksLikeImage(mimeType, filename)) return true

  const trimmed = extractedText.replace(/\s+/g, ' ').trim()
  // Scanned PDFs often yield empty/near-empty text from pdf-parse
  if (trimmed.length < 80 && byteLength > 20_000) return true
  if (trimmed.length < 20) return true
  return false
}
