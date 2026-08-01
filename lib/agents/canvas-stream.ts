import type { CanvasArtifact } from '@/lib/canvas/store'

export type CanvasStreamHandlers = {
  onChatText: (visibleText: string) => void
  onArtifactUpsert: (partial: Partial<CanvasArtifact> & { id: string }) => void
}

function slugId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF.-]+/g, '-')
    .replace(/^-|-$/g, '') || 'artifact'
}

export function createArtifactStreamParser(handlers: CanvasStreamHandlers) {
  let buffer = ''
  let inArtifact = false
  let current: {
    id: string
    type: CanvasArtifact['type']
    titleAr: string
    content: string
  } | null = null

  const openRe = /<artifact\s+type="(code|markdown|json|diff|html)"\s+title="([^"]+)">/i
  const closeTag = '</artifact>'

  return {
    push(chunk: string) {
      buffer += chunk
      while (buffer.length) {
        if (!inArtifact) {
          const m = buffer.match(openRe)
          if (!m || m.index === undefined) {
            handlers.onChatText(buffer)
            buffer = ''
            return
          }
          const before = buffer.slice(0, m.index)
          if (before) handlers.onChatText(before)
          inArtifact = true
          current = {
            id: slugId(m[2]),
            type: m[1] as CanvasArtifact['type'],
            titleAr: m[2],
            content: '',
          }
          buffer = buffer.slice(m.index + m[0].length)
          handlers.onArtifactUpsert({
            id: current.id,
            type: current.type,
            titleAr: current.titleAr,
            content: '',
            isEditing: false,
          })
        } else {
          const closeIdx = buffer.indexOf(closeTag)
          if (closeIdx === -1) {
            current!.content += buffer
            buffer = ''
            handlers.onArtifactUpsert({
              id: current!.id,
              type: current!.type,
              titleAr: current!.titleAr,
              content: current!.content,
              language: current!.type === 'code' ? 'text' : undefined,
              isEditing: false,
            })
            return
          }
          current!.content += buffer.slice(0, closeIdx)
          handlers.onArtifactUpsert({
            id: current!.id,
            type: current!.type,
            titleAr: current!.titleAr,
            content: current!.content,
            isEditing: false,
          })
          buffer = buffer.slice(closeIdx + closeTag.length)
          inArtifact = false
          current = null
        }
      }
    },
    flush() {
      if (!inArtifact && buffer) {
        handlers.onChatText(buffer)
        buffer = ''
      }
    },
  }
}

export function stripArtifactTags(text: string): string {
  return text.replace(
    /<artifact\s+type="[^"]+"\s+title="[^"]+">[\s\S]*?<\/artifact>/gi,
    ''
  ).trim()
}
