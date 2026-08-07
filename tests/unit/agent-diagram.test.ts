import { describe, expect, it } from 'vitest'
import { parseAgentDiagramJson } from '@/lib/canvas/agent-diagram'

describe('parseAgentDiagramJson', () => {
  it('accepts valid nodes', () => {
    const d = parseAgentDiagramJson({
      nodes: [{ id: 'a', labelAr: 'بداية' }],
      titleAr: 'مسار',
    })
    expect(d?.nodes).toHaveLength(1)
    expect(d?.titleAr).toBe('مسار')
  })

  it('rejects empty / invalid', () => {
    expect(parseAgentDiagramJson('{}')).toBeNull()
    expect(parseAgentDiagramJson('not-json')).toBeNull()
    expect(parseAgentDiagramJson({ nodes: [] })).toBeNull()
  })
})
