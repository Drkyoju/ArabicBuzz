'use client'

import { useCallback, useMemo } from 'react'
import { Tldraw, createShapeId, toRichText, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { cn } from '@/lib/utils'

export type FlowNode = {
  id: string
  labelAr: string
  x?: number
  y?: number
  w?: number
  h?: number
}

export type FlowEdge = {
  from: string
  to: string
  labelAr?: string
}

export type AgentDiagramJson = {
  nodes: FlowNode[]
  edges?: FlowEdge[]
  titleAr?: string
}

type Props = {
  className?: string
  /** Agent-generated flowchart JSON → tldraw visual shapes */
  diagram?: AgentDiagramJson | null
  onEditorReady?: (editor: Editor) => void
}

/**
 * Visual whiteboard (tldraw) with RTL title overlay.
 * Accepts agent flowchart JSON and maps nodes to geo shapes.
 */
export function VisualWhiteboard({
  className,
  diagram,
  onEditorReady,
}: Props) {
  const applyDiagram = useCallback((editor: Editor, data: AgentDiagramJson) => {
    const nodes = data.nodes || []
    if (!nodes.length) return

    const ids = nodes.map((n, i) => {
      const shapeId = createShapeId(`ab-${String(n.id || i).replace(/\W/g, '_')}`)
      const col = i % 3
      const row = Math.floor(i / 3)
      editor.createShape({
        id: shapeId,
        type: 'geo',
        x: n.x ?? 80 + col * 220,
        y: n.y ?? 80 + row * 140,
        props: {
          geo: 'rectangle',
          w: n.w ?? 180,
          h: n.h ?? 72,
          richText: toRichText(n.labelAr || n.id),
        },
      })
      return shapeId
    })

    // Simple note listing edges (arrow binding APIs vary by tldraw version)
    if (data.edges?.length) {
      const edgeText = data.edges
        .map((e) => `${e.from} → ${e.to}${e.labelAr ? ` (${e.labelAr})` : ''}`)
        .join('\n')
      editor.createShape({
        id: createShapeId('ab-edges-note'),
        type: 'note',
        x: 80,
        y: 80 + Math.ceil(nodes.length / 3) * 140 + 40,
        props: {
          richText: toRichText(`روابط:\n${edgeText}`),
        },
      })
    }

    if (ids.length) {
      editor.select(...ids)
      editor.zoomToSelection({ animation: { duration: 200 } })
    }
  }, [])

  const mountHandler = useMemo(
    () => (editor: Editor) => {
      onEditorReady?.(editor)
      if (diagram) applyDiagram(editor, diagram)
    },
    [applyDiagram, diagram, onEditorReady]
  )

  return (
    <div
      className={cn('relative h-full min-h-[20rem] w-full', className)}
      dir="ltr"
    >
      <div
        className="pointer-events-none absolute start-2 top-2 z-20 rounded-md border border-ab-border bg-white/90 px-2 py-1 text-[11px] font-medium text-ab-ink shadow-sm"
        dir="rtl"
      >
        لوحة مرئية · tldraw
        {diagram?.titleAr ? ` · ${diagram.titleAr}` : ''}
      </div>
      <Tldraw onMount={mountHandler} />
    </div>
  )
}

/** Parse agent JSON safely for the whiteboard. */
export function parseAgentDiagramJson(
  raw: string | unknown
): AgentDiagramJson | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!data || typeof data !== 'object') return null
    const nodes = (data as AgentDiagramJson).nodes
    if (!Array.isArray(nodes) || nodes.length === 0) return null
    return data as AgentDiagramJson
  } catch {
    return null
  }
}
