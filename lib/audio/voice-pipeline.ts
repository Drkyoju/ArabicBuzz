import { transcribeArabicAudioBuffer } from '@/lib/audio/transcribe'
import { generateArabicAudioBuffer } from '@/lib/audio/tts'
import { runAgentPipeline } from '@/lib/agents/pipeline'
import type { ActiveScopeContext } from '@/lib/scopes/types'

export async function handleInboundVoiceNote(opts: {
  channel: 'whatsapp' | 'telegram'
  mediaBuffer: Buffer
  mimeType: string
  scopeCtx: ActiveScopeContext
}) {
  const transcript = await transcribeArabicAudioBuffer(
    opts.mediaBuffer,
    opts.mimeType
  )
  const pipeline = await runAgentPipeline({
    rawUserPrompt: transcript,
    scopeCtx: opts.scopeCtx,
  })
  const audioOut = await generateArabicAudioBuffer(pipeline.output)
  return {
    transcript,
    replyText: pipeline.output,
    audioOut,
    qualityWarning: pipeline.qualityWarning,
  }
}
