'use client'

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

export type BrowserRecordSupport = {
  ok: boolean
  reasonAr?: string
  mimeType?: string
}

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return undefined
}

export function checkBrowserRecordSupport(): BrowserRecordSupport {
  if (typeof window === 'undefined') {
    return { ok: false, reasonAr: 'التسجيل متاح في المتصفح فقط' }
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reasonAr:
        'الميكروفون يتطلب اتصالًا آمنًا (HTTPS).',
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reasonAr: 'هذا المتصفح لا يدعم الوصول للميكروفون.',
    }
  }
  if (typeof MediaRecorder === 'undefined') {
    return {
      ok: false,
      reasonAr: 'التسجيل غير مدعوم هنا — استخدم رفع ملف صوتي.',
    }
  }
  const mimeType = pickRecorderMime()
  return { ok: true, mimeType }
}

export type ActiveRecording = {
  stop: () => Promise<{ blob: Blob; mimeType: string }>
  stream: MediaStream
  mimeType: string
}

function mapGetUserMediaError(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: string }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'رُفض إذن الميكروفون — فعّله من إعدادات الموقع في المتصفح.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'لم يُعثر على ميكروفون متصل.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'الميكروفون مستخدم من تطبيق آخر.'
  }
  return err instanceof Error ? err.message : 'تعذّر بدء التسجيل'
}

/**
 * Start a browser MediaRecorder session (Claude/Gemini-style click-to-talk).
 */
export async function startBrowserRecording(): Promise<ActiveRecording> {
  const support = checkBrowserRecordSupport()
  if (!support.ok) {
    throw new Error(support.reasonAr || 'التسجيل غير متاح')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    })
  } catch (e) {
    throw new Error(mapGetUserMediaError(e))
  }

  const mimeType = support.mimeType
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream)
  const chunks: Blob[] = []
  const usedMime = recorder.mimeType || mimeType || 'audio/webm'

  recorder.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data)
  }

  recorder.start(250)

  return {
    stream,
    mimeType: usedMime,
    stop: () =>
      new Promise((resolve, reject) => {
        const finish = () => {
          stream.getTracks().forEach((t) => t.stop())
          const blob = new Blob(chunks, { type: usedMime })
          if (blob.size < 64) {
            reject(new Error('التسجيل قصير جداً — حاول مجدداً'))
            return
          }
          resolve({ blob, mimeType: usedMime })
        }
        recorder.onstop = finish
        recorder.onerror = () => {
          stream.getTracks().forEach((t) => t.stop())
          reject(new Error('فشل التسجيل'))
        }
        try {
          if (recorder.state !== 'inactive') recorder.stop()
          else finish()
        } catch (e) {
          stream.getTracks().forEach((t) => t.stop())
          reject(e instanceof Error ? e : new Error('فشل إيقاف التسجيل'))
        }
      }),
  }
}

export function extForAudioMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}
