'use client'

/**
 * Light local denoise for mic capture (free, in-browser).
 * High-pass + mild compression before MediaRecorder — no paid API / no ffmpeg.
 */
export type CleanedMicStream = {
  /** Stream to feed MediaRecorder */
  recordStream: MediaStream
  /** Stop tracks + close AudioContext */
  cleanup: () => void
}

export async function createDenoisedMicStream(
  raw: MediaStream
): Promise<CleanedMicStream> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) {
    return {
      recordStream: raw,
      cleanup: () => raw.getTracks().forEach((t) => t.stop()),
    }
  }

  let ctx: AudioContext
  try {
    ctx = new AudioCtx()
  } catch {
    return {
      recordStream: raw,
      cleanup: () => raw.getTracks().forEach((t) => t.stop()),
    }
  }

  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    /* ignore */
  }

  try {
    const source = ctx.createMediaStreamSource(raw)
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 85
    highpass.Q.value = 0.7

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -28
    compressor.knee.value = 18
    compressor.ratio.value = 3
    compressor.attack.value = 0.01
    compressor.release.value = 0.2

    const gain = ctx.createGain()
    gain.gain.value = 1.15

    const dest = ctx.createMediaStreamDestination()
    source.connect(highpass)
    highpass.connect(compressor)
    compressor.connect(gain)
    gain.connect(dest)

    return {
      recordStream: dest.stream,
      cleanup: () => {
        try {
          source.disconnect()
          highpass.disconnect()
          compressor.disconnect()
          gain.disconnect()
        } catch {
          /* ignore */
        }
        raw.getTracks().forEach((t) => t.stop())
        void ctx.close().catch(() => undefined)
      },
    }
  } catch {
    void ctx.close().catch(() => undefined)
    return {
      recordStream: raw,
      cleanup: () => raw.getTracks().forEach((t) => t.stop()),
    }
  }
}
