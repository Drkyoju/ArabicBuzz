import OpenAI from 'openai'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export async function generateArabicAudioBuffer(text: string): Promise<Buffer> {
  if (IS_AIR_GAPPED_MODE) {
    throw new Error('تحويل النص إلى صوت سحابي غير متاح في الوضع المحلي المغلق')
  }
  const clipped = text.slice(0, 4000)
  if (process.env.TTS_PROVIDER === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clipped,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    )
    if (!res.ok) throw new Error('فشل توليد الصوت عبر ElevenLabs')
    return Buffer.from(await res.arrayBuffer())
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const speech = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',
    input: clipped,
    response_format: 'opus',
  })
  return Buffer.from(await speech.arrayBuffer())
}
