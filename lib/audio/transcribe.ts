import OpenAI, { toFile } from 'openai'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { validateNetworkAccess } from '@/lib/security/airgap'
import { resolveProviderKeySync } from '@/lib/ai/provider-key-store'

function extFromMime(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'ogg'
}

const NOISE_RE =
  /\[(?:موسيقى|صمت|ضحك|موسيقى خلفية|Music|Silence)\]|\((?:صمت|موسيقى)\)|♪+/gi

export function cleanTranscript(text: string): string {
  return text.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Reject Latin/Franco / random-script “طلاسم” that some models return when
 * language is wrong or audio is misdecoded. Short numeric replies are OK.
 */
export function isPlausibleArabicTranscript(text: string): boolean {
  const t = cleanTranscript(text)
  if (!t) return false
  if (t.length < 2) return false
  const arabic = (t.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || [])
    .length
  const letters = (t.match(/\p{L}/gu) || []).length
  if (letters === 0) {
    // digits / punctuation only — allow short confirmations
    return t.length <= 24
  }
  // Prefer Arabic script; allow short mixed if any Arabic letters exist
  if (arabic >= 2 && arabic / letters >= 0.35) return true
  if (arabic >= 4) return true
  return false
}

function acceptArabicOrNull(text: string | null | undefined): string | null {
  const cleaned = cleanTranscript(text || '')
  if (!cleaned) return null
  if (!isPlausibleArabicTranscript(cleaned)) return null
  return cleaned
}

export type ArabicSttProvider =
  | 'willow'
  | 'gemini'
  | 'cohere-hf'
  | 'sada-hf'
  | 'groq'
  | 'deepgram'
  | 'openai'
  | 'none'

export type ArabicSttResult = {
  text: string
  provider: ArabicSttProvider
  providerLabelAr: string
}

const HF_COHERE = 'CohereLabs/cohere-transcribe-arabic-07-2026'
const HF_SADA = 'wageehkhad/whisper-medium-finetuned-sada-asr'

/**
 * Download a WhatsApp Cloud API media object via Meta Graph using WHATSAPP_TOKEN.
 */
export async function downloadWhatsAppAudioBuffer(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) {
    throw new Error('WHATSAPP_TOKEN missing — set it in Netlify environment variables')
  }

  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`
  validateNetworkAccess(metaUrl)

  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) {
    throw new Error(`تعذّر جلب بيانات الوسائط من Meta (${metaRes.status})`)
  }

  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!meta.url) {
    throw new Error('رابط الوسائط غير متوفر من Graph API')
  }

  validateNetworkAccess(meta.url)
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!binRes.ok) {
    throw new Error(`تعذّر تنزيل الملف الصوتي من Meta (${binRes.status})`)
  }

  return {
    buffer: Buffer.from(await binRes.arrayBuffer()),
    mimeType: meta.mime_type || 'audio/ogg',
  }
}

function extractHfText(payload: unknown): string {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) {
    return payload
      .map((row) => {
        if (typeof row === 'string') return row
        if (row && typeof row === 'object' && 'text' in row) {
          return String((row as { text?: string }).text || '')
        }
        return ''
      })
      .join(' ')
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    if (typeof o.transcription === 'string') return o.transcription
    if (Array.isArray(o.chunks)) {
      return o.chunks
        .map((c) =>
          c && typeof c === 'object' && 'text' in c
            ? String((c as { text?: string }).text || '')
            : ''
        )
        .join(' ')
    }
  }
  return ''
}

async function transcribeViaHuggingFace(
  buffer: Buffer,
  mimeType: string,
  model: string
): Promise<string | null> {
  const token = resolveProviderKeySync('HF_TOKEN')
  if (!token) return null

  const url = `https://api-inference.huggingface.co/models/${model}`
  validateNetworkAccess(url)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType || 'audio/webm',
      Accept: 'application/json',
    },
    body: new Uint8Array(buffer),
  })

  if (res.status === 503) {
    // model loading — brief wait then one retry
    await new Promise((r) => setTimeout(r, 2500))
    const retry = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType || 'audio/webm',
        Accept: 'application/json',
      },
      body: new Uint8Array(buffer),
    })
    if (!retry.ok) return null
    return acceptArabicOrNull(extractHfText(await retry.json()))
  }

  if (!res.ok) return null
  return acceptArabicOrNull(extractHfText(await res.json()))
}

async function transcribeViaGroq(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const key = resolveProviderKeySync('GROQ_API_KEY')
  if (!key) return null

  validateNetworkAccess('https://api.groq.com')
  const form = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: mimeType || 'audio/webm',
  })
  form.append(
    'file',
    blob,
    `audio.${extFromMime(mimeType)}`
  )
  form.append('model', 'whisper-large-v3')
  form.append('language', 'ar')
  form.append('response_format', 'json')
  form.append(
    'prompt',
    'نسخ عربي فصيح ولهجات خليجية وسعودية بدقة عالية بدون ترجمة.'
  )

  const res = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    }
  )
  if (!res.ok) return null
  const data = (await res.json()) as { text?: string }
  return acceptArabicOrNull(data.text || '')
}

async function transcribeViaDeepgram(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const key =
    resolveProviderKeySync('DEEPGRAM_API_KEY') ||
    process.env.DEEPGRAM_API_KEY?.trim()
  if (!key) return null
  const model = process.env.DEEPGRAM_MODEL?.trim() || 'nova-2'
  const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&language=ar&smart_format=true`
  validateNetworkAccess(url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    results?: {
      channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>
    }
  }
  const text =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
  return acceptArabicOrNull(text)
}

/**
 * Self-hosted Willow Inference Server (open source Whisper).
 * https://github.com/toverainc/willow-inference-server
 * Set WILLOW_STT_URL=https://host:19000/api/willow
 */
async function transcribeViaWillow(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const base = (
    process.env.WILLOW_STT_URL ||
    process.env.WIS_URL ||
    process.env.WILLOW_INFERENCE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '')
  if (!base) return null

  const endpoint = /\/api\//i.test(base) ? base : `${base}/api/willow`
  validateNetworkAccess(endpoint)

  const form = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: mimeType || 'audio/webm',
  })
  form.append('file', blob, `audio.${extFromMime(mimeType)}`)
  form.append('language', process.env.WILLOW_STT_LANGUAGE || 'ar')
  form.append('model', process.env.WILLOW_STT_MODEL || 'medium')

  const headers: Record<string, string> = {}
  const token =
    process.env.WILLOW_STT_TOKEN?.trim() ||
    process.env.WIS_TOKEN?.trim() ||
    ''
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as
    | { text?: string; transcript?: string; result?: string }
    | string
    | null
  if (typeof data === 'string') return acceptArabicOrNull(data)
  const text = data?.text || data?.transcript || data?.result || ''
  return acceptArabicOrNull(text)
}

/**
 * Free Gemini multimodal transcription (same GEMINI_API_KEY as chat).
 * Strong Arabic/Gulf understanding without a separate Whisper bill.
 */
async function transcribeViaGemini(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const key =
    resolveProviderKeySync('GEMINI_API_KEY') ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim()
  if (!key) return null

  const model =
    process.env.GEMINI_STT_MODEL?.trim() ||
    process.env.OCR_GEMINI_MODEL?.trim() ||
    'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  validateNetworkAccess(url)

  const mime =
    mimeType && mimeType.startsWith('audio/')
      ? mimeType.split(';')[0]
      : 'audio/webm'

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'انسخ الكلام المنطوق في هذا التسجيل إلى نص عربي بالحروف العربية فقط (فصحى أو لهجة خليجية/سعودية حسب المتحدث). ممنوع الترجمة للإنجليزية أو الكتابة بحروف لاتينية (Franco-Arab). لا تلخّص ولا تضف تعليقات أو علامات. أعد النص العربي المنطوق فقط.',
            },
            {
              inlineData: {
                mimeType: mime,
                data: buffer.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(' ') ||
    ''
  return acceptArabicOrNull(text)
}

/**
 * Transcribe Arabic (incl. Saudi dialect) with paid OpenAI Whisper (fallback).
 */
export async function transcribeArabicAudioBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (IS_AIR_GAPPED_MODE) {
    throw new Error('النسخ الصوتي السحابي غير متاح في الوضع المحلي المغلق')
  }
  const openaiKey = resolveProviderKeySync('OPENAI_API_KEY')
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY missing — مطلوب لـ Whisper على Netlify')
  }
  if (!buffer?.length || buffer.length < 64) {
    throw new Error('تعذر قراءة الملاحظة الصوتية')
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const file = await toFile(buffer, `audio.${extFromMime(mimeType)}`, {
    type: mimeType || 'audio/ogg',
  })

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ar',
      prompt: 'نسخ عربي فصيح ولهجات سعودية وخليجية.',
    })
    const cleaned = acceptArabicOrNull(result.text || '')
    if (!cleaned) {
      throw new Error('لم يتم رصد كلام عربي واضح في الملاحظة الصوتية')
    }
    return cleaned
  } catch (e) {
    if (e instanceof Error && /ملاحظة|OPENAI|مغلق|واضح|عربي/.test(e.message)) {
      throw e
    }
    throw new Error('تعذر قراءة الملاحظة الصوتية عبر Whisper')
  }
}

/**
 * Free-first Arabic/Saudi STT cascade for the composer mic.
 * Willow (self-host Whisper) → Gemini → HF Arabic → Groq Whisper → Deepgram.
 */
export async function transcribeArabicSpeech(
  buffer: Buffer,
  mimeType: string
): Promise<ArabicSttResult> {
  if (IS_AIR_GAPPED_MODE) {
    throw new Error('النسخ الصوتي السحابي غير متاح في الوضع المحلي المغلق')
  }
  if (!buffer?.length || buffer.length < 64) {
    throw new Error('تعذر قراءة الملاحظة الصوتية')
  }

  const preferred = (process.env.ASR_PREFERRED || '').toLowerCase().trim()
  const preferSaudi =
    preferred === 'sada' ||
    (process.env.ASR_DIALECT || '').toLowerCase().includes('saudi')

  if (!preferred || preferred === 'willow' || preferred === 'wis') {
    try {
      const text = await transcribeViaWillow(buffer, mimeType)
      if (text) {
        return {
          text,
          provider: 'willow',
          providerLabelAr: 'Willow Whisper (ذاتي/مجاني)',
        }
      }
    } catch {
      /* try next */
    }
  }

  if (!preferred || preferred === 'gemini' || preferred === 'google') {
    try {
      const text = await transcribeViaGemini(buffer, mimeType)
      if (text) {
        return {
          text,
          provider: 'gemini',
          providerLabelAr: 'Gemini صوت → نص (مجاني)',
        }
      }
    } catch {
      /* try next */
    }
  }

  const hfOrder = preferSaudi
    ? ([
        { model: HF_SADA, provider: 'sada-hf' as const, label: 'SADA سعودي (مجاني)' },
        { model: HF_COHERE, provider: 'cohere-hf' as const, label: 'Cohere Arabic (مجاني)' },
      ] as const)
    : ([
        { model: HF_COHERE, provider: 'cohere-hf' as const, label: 'Cohere Arabic (مجاني)' },
        { model: HF_SADA, provider: 'sada-hf' as const, label: 'SADA سعودي (مجاني)' },
      ] as const)

  for (const step of hfOrder) {
    if (
      preferred === 'groq' ||
      preferred === 'openai' ||
      preferred === 'deepgram' ||
      preferred === 'gemini' ||
      preferred === 'willow'
    ) {
      break
    }
    if (preferred === 'sada' && step.provider !== 'sada-hf') continue
    if (preferred === 'cohere' && step.provider !== 'cohere-hf') continue
    try {
      const text = await transcribeViaHuggingFace(buffer, mimeType, step.model)
      if (text) {
        return {
          text,
          provider: step.provider,
          providerLabelAr: step.label,
        }
      }
    } catch {
      /* try next */
    }
  }

  if (preferred !== 'openai' && preferred !== 'deepgram' && preferred !== 'gemini') {
    try {
      const text = await transcribeViaGroq(buffer, mimeType)
      if (text) {
        return {
          text,
          provider: 'groq',
          providerLabelAr: 'Groq Whisper (مجاني)',
        }
      }
    } catch {
      /* try next */
    }
  }

  if (preferred === 'deepgram' || (preferred !== 'openai' && preferred !== 'groq' && preferred !== 'gemini')) {
    try {
      const text = await transcribeViaDeepgram(buffer, mimeType)
      if (text) {
        return {
          text,
          provider: 'deepgram',
          providerLabelAr: 'Deepgram',
        }
      }
    } catch {
      /* try next */
    }
  }

  if (resolveProviderKeySync('OPENAI_API_KEY')) {
    const text = await transcribeArabicAudioBuffer(buffer, mimeType)
    return {
      text,
      provider: 'openai',
      providerLabelAr: 'OpenAI Whisper',
    }
  }

  throw new Error(
    'تعذّر النسخ الصوتي. تأكد من GEMINI_API_KEY، أو أضف HF_TOKEN / GROQ_API_KEY، أو اضبط WILLOW_STT_URL لخادم Whisper مجاني.'
  )
}

/** Download WhatsApp voice note from Meta, then STT to Arabic text. */
export async function transcribeWhatsAppVoiceNote(
  mediaId: string
): Promise<{ transcript: string; mimeType: string }> {
  const { buffer, mimeType } = await downloadWhatsAppAudioBuffer(mediaId)
  try {
    const result = await transcribeArabicSpeech(buffer, mimeType)
    return { transcript: result.text, mimeType }
  } catch {
    const transcript = await transcribeArabicAudioBuffer(buffer, mimeType)
    return { transcript, mimeType }
  }
}

/** @deprecated prefer transcribeArabicAudioBuffer / transcribeArabicSpeech */
export const transcribeArabicAudio = transcribeArabicAudioBuffer
