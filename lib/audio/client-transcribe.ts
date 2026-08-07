'use client'

import { authHeaders } from '@/lib/supabase/browser'
import { extForAudioMime } from '@/lib/audio/browser-record'

export type ClientTranscribeResult = {
  ok: true
  text: string
  providerLabelAr?: string
  provider?: string
}

export type ClientTranscribeFailure = {
  ok: false
  error: string
}

/**
 * Browser → `/api/audio/transcribe` (free Arabic STT cascade).
 */
export async function transcribeVoiceBlob(
  blob: Blob,
  mimeType: string
): Promise<ClientTranscribeResult | ClientTranscribeFailure> {
  try {
    if (blob.size < 400) {
      return {
        ok: false,
        error: 'التسجيل قصير جداً — تكلم ثانية أو اثنتين ثم أوقف',
      }
    }
    const form = new FormData()
    form.append('file', blob, `voice.${extForAudioMime(mimeType)}`)
    const res = await fetch('/api/audio/transcribe', {
      method: 'POST',
      headers: await authHeaders(),
      body: form,
    })
    const data = (await res.json()) as {
      text?: string
      error?: string
      providerLabelAr?: string
      provider?: string
    }
    const text = (data.text || '').trim()
    if (!res.ok || !text) {
      return {
        ok: false,
        error:
          data.error ||
          'تعذّر النسخ الصوتي بالعربية — يمكنك حفظ الصوت فقط أو إعادة المحاولة',
      }
    }
    return {
      ok: true,
      text,
      providerLabelAr: data.providerLabelAr,
      provider: data.provider,
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : 'تعذّر النسخ الصوتي — تحقق من الاتصال ثم أعد المحاولة',
    }
  }
}
