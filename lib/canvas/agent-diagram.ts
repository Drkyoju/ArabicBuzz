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

/** Parse agent JSON safely for the whiteboard (no tldraw import). */
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
