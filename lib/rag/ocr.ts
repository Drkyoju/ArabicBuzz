/**
 * Arabic document OCR for scanned PDFs / images.
 *
 * OCR vs RAG (short):
 * - OCR = قراءة النص من صورة أو PDF ممسوح (لا طبقة نص للنسخ)
 * - RAG = تخزين ذلك النص والبحث فيه لاحقاً عند سؤال الوكيل
 *
 * General cascade (free-first; Paddle primary when available):
 * 1) PaddleOCR Arabic — mac-hop POST /ocr/paddle, or PADDLE_OCR_URL, or ENABLE_PADDLE_OCR
 * 2) Mac Tesseract — POST /pdf-page-ocr (ara+eng) if Paddle missing / weak / fails quality
 * 3) QARI_OCR_URL — local Manazir/Qari HTTP
 * 4) Hugging Face Inference (HF_TOKEN) — Qari model
 * 5) Gemini vision (GEMINI_API_KEY) — cloud fallback
 *
 * Convert PDF→Office cascade (honest clean-or-refuse; free Paddle first):
 * 1) PaddleOCR when available (mac-hop / PADDLE_OCR_URL / ENABLE_PADDLE_OCR)
 * 2) Mac Tesseract if Paddle weak/unavailable
 * 3) Gemini Flash OCR/vision
 * 4) Stronger Gemini if Flash fails quality gate
 * 5) STOP — do NOT auto-call Mistral. Opt-in only:
 *    CONVERT_ALLOW_MISTRAL=1 AND MISTRAL_API_KEY (default OFF)
 * 6) Else refuse — never return mojibake / طلاسم
 *
 * Note: Paddle is NOT baked into the thin CranL image by default (too heavy).
 * Prefer Mac hop /ocr/paddle, or a sidecar via PADDLE_OCR_URL.
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
} from '@/lib/documents/arabic-text-quality'
import {
  macPageOcr,
  macPaddleOcr,
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

/**
 * Mistral OCR for convert is opt-in only (default OFF).
 * Requires CONVERT_ALLOW_MISTRAL=1 AND MISTRAL_API_KEY — never auto-call after Paddle.
 */
export function mistralOcrConfigured(): boolean {
  return (
    process.env.CONVERT_ALLOW_MISTRAL?.trim() === '1' &&
    Boolean(process.env.MISTRAL_API_KEY?.trim()) &&
    !IS_AIR_GAPPED_MODE
  )
}

/** Sidecar URL, local ENABLE_PADDLE_OCR, and/or Mac hop (POST /ocr/paddle). */
export function paddleOcrConfigured(): boolean {
  if (IS_AIR_GAPPED_MODE) return false
  if (process.env.PADDLE_OCR_URL?.trim()) return true
  const enable =
    process.env.ENABLE_PADDLE_OCR?.trim() === '1' ||
    process.env.INSTALL_PADDLE_OCR?.trim() === '1'
  if (enable) return true
  // Mac hop may expose /ocr/paddle — probe at runtime via health.tools.paddle.
  if (
    macSyncConfigured() &&
    process.env.PADDLE_OCR_SKIP_MAC?.trim() !== '1'
  ) {
    return true
  }
  return false
}

let macPaddleHealthCache: { at: number; ok: boolean } | null = null

/** Cached GET /health → tools.paddle (skip hop when paddleocr not installed). */
async function macPaddleReady(): Promise<boolean> {
  if (!macSyncConfigured()) return false
  if (process.env.PADDLE_OCR_SKIP_MAC?.trim() === '1') return false
  const now = Date.now()
  if (macPaddleHealthCache && now - macPaddleHealthCache.at < 60_000) {
    return macPaddleHealthCache.ok
  }
  try {
    const { macHealth } = await import('@/lib/storage/mac-sync-client')
    const h = await macHealth()
    const ok = Boolean(h.ok && h.tools?.paddle)
    macPaddleHealthCache = { at: now, ok }
    return ok
  } catch {
    macPaddleHealthCache = { at: now, ok: false }
    return false
  }
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
 * Optional paid OCR — only when CONVERT_ALLOW_MISTRAL=1 AND MISTRAL_API_KEY.
 * Default OFF: convert cascade stops after Gemini→Paddle without calling this.
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

async function ocrViaMacPaddle(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  if (!macSyncConfigured()) return null
  if (process.env.PADDLE_OCR_SKIP_MAC?.trim() === '1') return null
  if (!(await macPaddleReady())) return null
  try {
    const mac = await macPaddleOcr({
      buffer,
      filename,
      mimeType: mime,
      lang: process.env.PADDLE_OCR_LANG?.trim() || 'ar',
    })
    if (mac.text?.trim()) {
      return { text: mac.text.trim(), provider: 'paddle' }
    }
  } catch (e) {
    return {
      text: '',
      provider: 'paddle',
      error: e instanceof Error ? e.message : 'mac paddle failed',
    }
  }
  return null
}

/**
 * PaddleOCR: Mac hop /ocr/paddle first, then HTTP sidecar, then local python.
 * Apache-2.0 self-hosted — preferred primary when available.
 */
async function ocrViaPaddle(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ArabicOcrResult | null> {
  if (!paddleOcrConfigured()) return null

  const mac = await ocrViaMacPaddle(buffer, mime, filename)
  if (mac?.text?.trim()) return mac

  const http = await ocrViaPaddleHttp(buffer, mime, filename)
  if (http?.text?.trim()) return http

  const local = await ocrViaPaddleLocal(buffer, mime, filename)
  if (local?.text?.trim()) return local

  return local || http || mac
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

/** Softer gate for general read/OCR (images, short labels). */
function ocrPassesGeneralGate(text: string): boolean {
  const t = String(text || '').trim()
  if (t.length < 8) return false
  if (hasArabicMojibake(t)) return false
  if (assessArabicTextQuality(t).broken) return false
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
 * Paddle (primary when available) → Tesseract mac → Gemini Flash → stronger → STOP
 * (Mistral only if CONVERT_ALLOW_MISTRAL=1 + MISTRAL_API_KEY — default OFF).
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

  // 1) PaddleOCR Arabic first (mac-hop / sidecar / local)
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
      'PaddleOCR: غير مضبوط (MAC_SYNC /ocr/paddle أو PADDLE_OCR_URL أو ENABLE_PADDLE_OCR=1) — تُخطّي.'
    )
  }

  // 2) Mac Tesseract if Paddle missing / weak
  if (macSyncConfigured()) {
    const tess = await ocrViaMacFree(opts.buffer, mime, filename)
    if (tess?.text?.trim() && ocrPassesConvertGate(tess.text)) {
      pushAttempt(attempts, 'tesseract-mac', tess)
      return {
        best: { text: tess.text.trim(), source: 'ocr-tesseract-mac' },
        attempts,
      }
    }
    pushAttempt(attempts, 'tesseract-mac', tess)
  } else {
    pushAttempt(
      attempts,
      'tesseract-mac',
      null,
      'Tesseract: MAC_SYNC_URL غير مضبوط — تُخطّي.'
    )
  }

  // 3) Gemini Flash
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

  // 4) Stronger Gemini if Flash was weak / empty
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

  // 5) Mistral ONLY if explicitly enabled (CONVERT_ALLOW_MISTRAL=1 + key). Default: STOP.
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
      'Mistral: معطّل افتراضياً — يتطلّب CONVERT_ALLOW_MISTRAL=1 وMISTRAL_API_KEY. توقّفنا بعد Paddle وTesseract وGemini (لا استدعاء تلقائي).'
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

  // 1) PaddleOCR Arabic first when available (mac-hop / URL / local)
  if (paddleOcrConfigured()) {
    const paddle = await ocrViaPaddle(opts.buffer, mime, filename)
    if (paddle?.text?.trim() && ocrPassesGeneralGate(paddle.text)) {
      return paddle
    }
  }

  // 2) Tesseract on Mac if Paddle unavailable / weak / failed
  const mac = await ocrViaMacFree(opts.buffer, mime, filename)
  if (mac?.text?.trim() && ocrPassesGeneralGate(mac.text)) {
    return mac
  }
  // Accept non-empty Tesseract even if gate soft-fails only on length for tiny labels
  if (mac?.text?.trim() && !hasArabicMojibake(mac.text) && !assessArabicTextQuality(mac.text).broken) {
    return mac
  }

  // 3) Qari local → HF
  const local = await ocrViaLocalQari(opts.buffer, mime, filename)
  if (local?.text?.trim()) return local

  const hf = await ocrViaHuggingFaceQari(opts.buffer, mime)
  if (hf?.text?.trim()) return hf

  // 4) Gemini cloud fallback
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
