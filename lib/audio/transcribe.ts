import OpenAI, { toFile } from 'openai'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { validateNetworkAccess } from '@/lib/security/airgap'

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

export type ArabicSttProvider =
  | 'cohere-hf'
  | 'sada-hf'
  | 'groq'
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
  const token = process.env.HF_TOKEN?.trim() || process.env.HUGGINGFACE_TOKEN?.trim()
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
    return cleanTranscript(extractHfText(await retry.json()))
  }

  if (!res.ok) return null
  return cleanTranscript(extractHfText(await res.json()))
}

async function transcribeViaGroq(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim()
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
  return cleanTranscript(data.text || '')
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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — مطلوب لـ Whisper على Netlify')
  }
  if (!buffer?.length || buffer.length < 64) {
    throw new Error('تعذر قراءة الملاحظة الصوتية')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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
    const cleaned = cleanTranscript(result.text || '')
    if (!cleaned) {
      throw new Error('لم يتم رصد كلام واضح في الملاحظة الصوتية')
    }
    return cleaned
  } catch (e) {
    if (e instanceof Error && /ملاحظة|OPENAI|مغلق|واضح/.test(e.message)) {
      throw e
    }
    throw new Error('تعذر قراءة الملاحظة الصوتية عبر Whisper')
  }
}

/**
 * Free-first Arabic/Saudi STT cascade for the composer mic.
 * Cohere Arabic (HF) → SADA Saudi Whisper (HF) → Groq Whisper → OpenAI.
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
    if (preferred === 'groq' || preferred === 'openai') break
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

  if (preferred !== 'openai') {
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

  if (process.env.OPENAI_API_KEY) {
    const text = await transcribeArabicAudioBuffer(buffer, mimeType)
    return {
      text,
      provider: 'openai',
      providerLabelAr: 'OpenAI Whisper',
    }
  }

  throw new Error(
    'تعذّر النسخ الصوتي. أضف HF_TOKEN (مجاني للعربية/السعودية) أو GROQ_API_KEY، أو OPENAI_API_KEY كاحتياطي.'
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
