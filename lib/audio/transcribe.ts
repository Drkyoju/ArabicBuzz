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

/**
 * Transcribe Arabic (incl. Saudi dialect) voice notes with OpenAI Whisper.
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

/** Download WhatsApp voice note from Meta, then Whisper-transcribe to Arabic text. */
export async function transcribeWhatsAppVoiceNote(
  mediaId: string
): Promise<{ transcript: string; mimeType: string }> {
  const { buffer, mimeType } = await downloadWhatsAppAudioBuffer(mediaId)
  const transcript = await transcribeArabicAudioBuffer(buffer, mimeType)
  return { transcript, mimeType }
}

/** @deprecated prefer transcribeArabicAudioBuffer */
export const transcribeArabicAudio = transcribeArabicAudioBuffer
