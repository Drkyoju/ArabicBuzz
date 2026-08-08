/**
 * Arabic document OCR for scanned PDFs / images.
 *
 * OCR vs RAG (short):
 * - OCR = قراءة النص من صورة أو PDF ممسوح (لا طبقة نص للنسخ)
 * - RAG = تخزين ذلك النص والبحث فيه لاحقاً عند سؤال الوكيل
 *
 * General cascade (free-first when Mac bridge is up):
 * 1) Mac sync POST /pdf-page-ocr — PyMuPDF + Tesseract ara+eng (brew)
 * 2) QARI_OCR_URL — local Manazir/Qari HTTP
 * 3) Hugging Face Inference (HF_TOKEN) — Qari model
 * 4) Gemini vision (GEMINI_API_KEY) — strong Arabic OCR fallback on Netlify
 *
 * Convert PDF→Office cascade (honest clean-or-refuse):
 * Gemini leads OCR Arena (https://www.ocrarena.ai/leaderboard) — primary, not a last resort.
 * 1) Gemini Flash OCR/vision
 * 2) Stronger Gemini if Flash fails quality gate (project max, e.g. 3.1 Pro)
 * 3) PaddleOCR when available (PADDLE_OCR_URL / ENABLE_PADDLE_OCR) — cheap self-hosted
 *    fallback only after Gemini quality gate fails (not because Paddle is "stronger")
 * 4) Mistral OCR only if MISTRAL_API_KEY and still needed after Paddle
 * 5) Else refuse — never return mojibake
 *
 * Note: Paddle is NOT baked into the thin CranL image by default (too heavy).
 * Prefer a sidecar via PADDLE_OCR_URL, or ENABLE_PADDLE_OCR=1 where paddleocr is installed.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateText } from 'ai'
import { getCloudProviders } from '@/lib/ai/providers'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import {
  assessArabicTextQuality,
  hasArabicMojibake,
  pickBestCleanArabicText,
} from '@/lib/documents/arabic-text-quality'
import {
  macPageOcr,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

export type ArabicOcrResult = {
  text: string
  provider:
    | 'tesseract-mac'
    | 'qari-local'
    | 'qari-hf'
    | 'gemini'
    | 'gemini-flash'
    | 'gemini-strong'
    | 'paddle'
    | 'mistral'
    | 'none'
  error?: string
}

export function mistralOcrConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY?.trim()) && !IS_AIR_GAPPED_MODE
}

/** Sidecar URL and/or local ENABLE_PADDLE_OCR — never invent keys. */
export function paddleOcrConfigured(): boolean {
  if (IS_AIR_GAPPED_MODE) return false
  if (process.env.PADDLE_OCR_URL?.trim()) return true
  const enable =
    process.env.ENABLE_PADDLE_OCR?.trim() === '1' ||
    process.env.INSTALL_PADDLE_OCR?.trim() === '1'
  return enable
}

function geminiFlashModelId(): string {
  return (
    process.env.OCR_GEMINI_FLASH_MODEL?.trim() ||
    process.env.OCR_GEMINI_MODEL?.trim() ||
    'gemini-2.5-flash'
  )
}

function geminiStrongModelId(): string {
  // Strongest Gemini OCR-capable model in harness catalog (Arena-leading family).
  return (
    process.env.OCR_GEMINI_STRONG_MODEL?.trim() ||
    'gemini-3.1-pro'
  )
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

async function ocrViaGeminiModel(
  buffer: Buffer,
  mime: string,
  filename: string,
  modelId: string,
  provider: 'gemini' | 'gemini-flash' | 'gemini-strong'
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
    const isImage = looksLikeImage(mime, filename)
    const isPdf = looksLikePdf(mime, filename)

    async function callGemini(payload: Buffer, mediaType: string) {
      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: Buffer }
        | { type: 'file'; data: Buffer; mediaType: string }
      > = [{ type: 'text', text: ARABIC_OCR_PROMPT }]

      if (mediaType.startsWith('image/')) {
        content.push({ type: 'image', image: payload })
      } else {
        content.push({
          type: 'file',
          data: payload,
          mediaType,
        })
      }

      const result = await generateText({
        model: google(modelId),
        messages: [{ role: 'user', content }],
      })

      const raw = result.text as unknown
      let text = ''
      if (typeof raw === 'string') text = raw.trim()
      else if (raw && typeof raw === 'object' && 'text' in (raw as object)) {
        text = String((raw as { text?: unknown }).text || '').trim()
      }
      return text && text !== '[object Object]' ? text : ''
    }

    let text = ''
    if (isImage) {
      text = await callGemini(buffer, mime.startsWith('image/') ? mime : 'image/png')
    } else if (isPdf) {
      // Full PDF first; on failure shrink to first pages (large scans often fail).
      text = await callGemini(buffer, 'application/pdf')
      if (!text && buffer.byteLength > 400_000) {
        try {
          const { PDFDocument } = await import('pdf-lib')
          const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
          const slim = await PDFDocument.create()
          const count = Math.min(3, src.getPageCount())
          const idxs = Array.from({ length: count }, (_, i) => i)
          const pages = await slim.copyPages(src, idxs)
          for (const p of pages) slim.addPage(p)
          const slimBytes = Buffer.from(await slim.save())
          text = await callGemini(slimBytes, 'application/pdf')
        } catch {
          /* keep empty */
        }
      }
    } else {
      text = await callGemini(buffer, mime.startsWith('image/') ? mime : 'image/png')
    }

    if (!text) {
      return {
        text: '',
        provider,
        error: `Gemini (${modelId}) لم يُرجع نصاً صالحاً`,
      }
    }

    return { text, provider }
  } catch (e) {
    return {
      text: '',
      provider,
      error: e instanceof Error ? e.message : 'gemini ocr failed',
    }
  }
}

/** Back-compat single-shot Gemini (Flash model). */
async function ocrViaGemini(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult> {
  return ocrViaGeminiModel(
    buffer,
    mime,
    filename,
    geminiFlashModelId(),
    'gemini'
  )
}

/**
 * Optional paid OCR — only when MISTRAL_API_KEY is set.
 * Uses official POST /v1/ocr with data-URL document (no invented keys).
 */
async function ocrViaMistral(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  const key = process.env.MISTRAL_API_KEY?.trim()
  if (!key || IS_AIR_GAPPED_MODE) return null

  const isImage = looksLikeImage(mime, filename)
  const isPdf = looksLikePdf(mime, filename)
  if (!isImage && !isPdf) return null

  const mediaType = isPdf
    ? 'application/pdf'
    : mime.startsWith('image/')
      ? mime
      : 'image/png'
  const dataUrl = `data:${mediaType};base64,${buffer.toString('base64')}`
  const document = isPdf
    ? { type: 'document_url' as const, document_url: dataUrl }
    : { type: 'image_url' as const, image_url: dataUrl }

  try {
    const model =
      process.env.OCR_MISTRAL_MODEL?.trim() || 'mistral-ocr-latest'
    const res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        document,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        text: '',
        provider: 'mistral',
        error: `Mistral OCR HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`,
      }
    }
    const json = (await res.json()) as {
      pages?: Array<{ markdown?: string; text?: string }>
      text?: string
    }
    const fromPages = (json.pages || [])
      .map((p) => String(p.markdown || p.text || '').trim())
      .filter(Boolean)
      .join('\n\n')
    const text = (fromPages || json.text || '').trim()
    if (!text) {
      return {
        text: '',
        provider: 'mistral',
        error: 'Mistral OCR لم يُرجع نصاً صالحاً',
      }
    }
    return { text, provider: 'mistral' }
  } catch (e) {
    return {
      text: '',
      provider: 'mistral',
      error: e instanceof Error ? e.message : 'mistral ocr failed',
    }
  }
}

async function ocrViaPaddleHttp(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  const base = (process.env.PADDLE_OCR_URL || '').replace(/\/$/, '')
  if (!base) return null
  const secret = process.env.PADDLE_OCR_SECRET?.trim() || ''
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
        lang: process.env.PADDLE_OCR_LANG?.trim() || 'ar',
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        text: '',
        provider: 'paddle',
        error: `PaddleOCR HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`,
      }
    }
    const data = (await res.json()) as { text?: string; error?: string }
    const text = (data.text || '').trim()
    if (!text) {
      return {
        text: '',
        provider: 'paddle',
        error: data.error || 'PaddleOCR لم يُرجع نصاً صالحاً',
      }
    }
    return { text, provider: 'paddle' }
  } catch (e) {
    return {
      text: '',
      provider: 'paddle',
      error: e instanceof Error ? e.message : 'paddle http failed',
    }
  }
}

function paddlePythonBin(): string {
  return (
    process.env.PADDLE_OCR_PYTHON?.trim() ||
    process.env.PDF_REPLACE_PYTHON?.trim() ||
    'python3'
  )
}

async function ocrViaPaddleLocal(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  const enable =
    process.env.ENABLE_PADDLE_OCR?.trim() === '1' ||
    process.env.INSTALL_PADDLE_OCR?.trim() === '1'
  if (!enable) return null

  const script =
    process.env.PADDLE_OCR_SCRIPT?.trim() ||
    join(process.cwd(), 'scripts', 'paddle-ocr.py')

  const ext = looksLikePdf(mime, filename)
    ? '.pdf'
    : looksLikeImage(mime, filename)
      ? filename.toLowerCase().match(/\.(png|jpe?g|webp|tif{1,2}|bmp|gif)$/)?.[0] ||
        '.png'
      : '.bin'

  let dir = ''
  try {
    dir = await mkdtemp(join(tmpdir(), 'ab-paddle-'))
    const inputPath = join(dir, `input${ext}`)
    await writeFile(inputPath, buffer)

    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        paddlePythonBin(),
        [script, inputPath, '--lang', process.env.PADDLE_OCR_LANG?.trim() || 'ar'],
        {
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('PaddleOCR المحلي تجاوز المهلة'))
      }, Number(process.env.PADDLE_OCR_TIMEOUT_MS || 120_000))
      child.stdout.on('data', (c) => {
        stdout += String(c)
      })
      child.stderr.on('data', (c) => {
        stderr += String(c)
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim().slice(0, 200) ||
                `paddle-ocr.py exit ${code}`
            )
          )
          return
        }
        resolve(stdout)
      })
    })

    let parsed: { ok?: boolean; text?: string; error?: string }
    try {
      parsed = JSON.parse(text) as typeof parsed
    } catch {
      return {
        text: '',
        provider: 'paddle',
        error: 'PaddleOCR المحلي أعاد JSON غير صالح',
      }
    }
    if (!parsed.ok || !String(parsed.text || '').trim()) {
      return {
        text: '',
        provider: 'paddle',
        error:
          parsed.error ||
          'PaddleOCR غير مثبت أو فشل — عيّن PADDLE_OCR_URL أو ثبّت paddleocr',
      }
    }
    return { text: String(parsed.text).trim(), provider: 'paddle' }
  } catch (e) {
    return {
      text: '',
      provider: 'paddle',
      error: e instanceof Error ? e.message : 'paddle local failed',
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * PaddleOCR: prefer HTTP sidecar (thin CranL), else local python when enabled.
 * Cheaper than Mistral (self-hosted / free) — quality is not always stronger.
 */
async function ocrViaPaddle(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  if (!paddleOcrConfigured()) return null
  const http = await ocrViaPaddleHttp(buffer, mime, filename)
  if (http?.text?.trim()) return http
  const local = await ocrViaPaddleLocal(buffer, mime, filename)
  if (local?.text?.trim()) return local
  return local || http
}

async function ocrViaMacFree(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  if (!macSyncConfigured()) return null
  try {
    const isPdf = looksLikePdf(mime, filename)
    const mac = await macPageOcr({
      buffer,
      filename,
      page: 1,
      lang: 'ara+eng',
      allPages: isPdf,
    })
    if (mac.text?.trim()) {
      return { text: mac.text.trim(), provider: 'tesseract-mac' }
    }
  } catch {
    /* fall through */
  }
  return null
}

function ocrPassesConvertGate(text: string): boolean {
  const t = String(text || '').trim()
  if (t.length < 40) return false
  if (hasArabicMojibake(t)) return false
  const q = assessArabicTextQuality(t)
  if (q.broken) return false
  return true
}

function pushAttempt(
  attempts: Array<{ provider: string; ok: boolean; detailAr: string }>,
  provider: string,
  result: ArabicOcrResult | null | undefined,
  skippedAr?: string
) {
  if (skippedAr) {
    attempts.push({ provider, ok: false, detailAr: skippedAr })
    return
  }
  const text = result?.text?.trim() || ''
  const clean = text ? ocrPassesConvertGate(text) : false
  attempts.push({
    provider,
    ok: clean,
    detailAr: result?.error
      ? `${provider}: ${result.error}`
      : clean
        ? `${provider}: نص نظيف اجتاز بوابة الجودة`
        : text
          ? `${provider}: نص فشل بوابة الجودة (طلاسم/عطب)`
          : `${provider}: بلا نص صالح`,
  })
}

/**
 * Convert PDF→Office OCR cascade (strict honesty):
 * Gemini Flash → Gemini stronger → PaddleOCR → Mistral (if key) → refuse.
 * Gemini-first matches OCR Arena leadership; Paddle/Mistral are fallbacks only.
 * Never returns mojibake — caller must refuse if null.
 */
export async function runConvertOcrCascade(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
}): Promise<{
  best: { text: string; source: string } | null
  attempts: Array<{ provider: string; ok: boolean; detailAr: string }>
}> {
  const mime = opts.mimeType || 'application/octet-stream'
  const filename = opts.filename || 'document.bin'
  const attempts: Array<{ provider: string; ok: boolean; detailAr: string }> =
    []

  // 1) Gemini Flash
  const flashId = geminiFlashModelId()
  const flash = await ocrViaGeminiModel(
    opts.buffer,
    mime,
    filename,
    flashId,
    'gemini-flash'
  )
  if (flash.text?.trim() && ocrPassesConvertGate(flash.text)) {
    pushAttempt(attempts, 'gemini-flash', flash)
    return {
      best: { text: flash.text.trim(), source: 'ocr-gemini-flash' },
      attempts,
    }
  }
  pushAttempt(attempts, 'gemini-flash', flash)

  // 2) Stronger Gemini if Flash was weak / empty
  const strongId = geminiStrongModelId()
  if (strongId !== flashId) {
    const strong = await ocrViaGeminiModel(
      opts.buffer,
      mime,
      filename,
      strongId,
      'gemini-strong'
    )
    if (strong.text?.trim() && ocrPassesConvertGate(strong.text)) {
      pushAttempt(attempts, 'gemini-strong', strong)
      return {
        best: { text: strong.text.trim(), source: 'ocr-gemini-strong' },
        attempts,
      }
    }
    pushAttempt(attempts, 'gemini-strong', strong)
  } else {
    pushAttempt(
      attempts,
      'gemini-strong',
      null,
      'Gemini أقوى: نفس نموذج Flash — تُخطّي التكرار'
    )
  }

  // 3) PaddleOCR — cheap self-hosted after Gemini gate fails (not "stronger than Gemini")
  if (paddleOcrConfigured()) {
    const paddle = await ocrViaPaddle(opts.buffer, mime, filename)
    if (paddle?.text?.trim() && ocrPassesConvertGate(paddle.text)) {
      pushAttempt(attempts, 'paddle', paddle)
      return {
        best: { text: paddle.text.trim(), source: 'ocr-paddle' },
        attempts,
      }
    }
    pushAttempt(attempts, 'paddle', paddle)
  } else {
    pushAttempt(
      attempts,
      'paddle',
      null,
      'PaddleOCR: غير مضبوط (PADDLE_OCR_URL أو ENABLE_PADDLE_OCR=1) — تُخطّي. أرخص من Mistral عند التثبيت؛ الجودة ليست دائماً أقوى.'
    )
  }

  // Optional free Mac/Qari before paid Mistral
  const freeTries: ArabicOcrResult[] = []
  const mac = await ocrViaMacFree(opts.buffer, mime, filename)
  if (mac) freeTries.push(mac)
  const qari = await ocrViaLocalQari(opts.buffer, mime, filename)
  if (qari?.text) freeTries.push(qari)
  const hf = await ocrViaHuggingFaceQari(opts.buffer, mime)
  if (hf?.text) freeTries.push(hf)

  const freePicked = pickBestCleanArabicText(
    freeTries.map((r) => ({
      text: r.text,
      source: `ocr-${r.provider}`,
    }))
  )
  for (const r of freeTries) {
    const clean = ocrPassesConvertGate(r.text)
    attempts.push({
      provider: r.provider,
      ok: clean,
      detailAr: clean
        ? `${r.provider}: نص نظيف`
        : r.error || `${r.provider}: فشل بوابة الجودة أو نص قصير`,
    })
  }
  if (freePicked && ocrPassesConvertGate(freePicked.text)) {
    return {
      best: { text: freePicked.text, source: freePicked.source },
      attempts,
    }
  }

  // 4) Mistral only if key present AND still needed
  if (mistralOcrConfigured()) {
    const mistral = await ocrViaMistral(opts.buffer, mime, filename)
    if (mistral?.text?.trim() && ocrPassesConvertGate(mistral.text)) {
      pushAttempt(attempts, 'mistral', mistral)
      return {
        best: { text: mistral.text.trim(), source: 'ocr-mistral' },
        attempts,
      }
    }
    pushAttempt(attempts, 'mistral', mistral)
  } else {
    pushAttempt(
      attempts,
      'mistral',
      null,
      'Mistral: غير مضبوط (لا MISTRAL_API_KEY) — تُخطّي'
    )
  }

  return { best: null, attempts }
}

/** Run Arabic+English OCR cascade on an image or scanned PDF. */
export async function runArabicOcr(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
}): Promise<ArabicOcrResult> {
  const mime = opts.mimeType || 'application/octet-stream'
  const filename = opts.filename || 'document.bin'

  // Free local path: Mac Tesseract ara+eng (images + PDF pages)
  const mac = await ocrViaMacFree(opts.buffer, mime, filename)
  if (mac?.text) return mac

  const local = await ocrViaLocalQari(opts.buffer, mime, filename)
  if (local && local.text) return local

  const hf = await ocrViaHuggingFaceQari(opts.buffer, mime)
  if (hf && hf.text) return hf

  if (paddleOcrConfigured()) {
    const paddle = await ocrViaPaddle(opts.buffer, mime, filename)
    if (paddle?.text?.trim()) return paddle
  }

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
  const isImage =
    looksLikeImage(mimeType, filename) ||
    /\.(png|jpe?g|webp|tif{1,2}|bmp|gif)$/i.test(lower)
  const isPdf = looksLikePdf(mimeType, filename)

  // Standalone images always need OCR (no copy-paste text layer)
  if (isImage) return true
  if (!isPdf && !isImage) return false

  const trimmed = extractedText.replace(/\s+/g, ' ').trim()
  // Scanned / image-only PDFs: empty or near-empty text layer
  if (trimmed.length < 80 && byteLength > 8_000) return true
  if (trimmed.length < 20) return true
  // Corrupt Arabic ToUnicode — prefer OCR over garbage layer
  if (isPdf && assessArabicTextQuality(trimmed).broken) {
    return true
  }
  return false
}
