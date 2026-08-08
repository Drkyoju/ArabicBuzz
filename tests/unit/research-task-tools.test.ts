import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  executeResearchTaskTools,
  formatBlockedTaskReplyAr,
} from '@/lib/agents/tools/research-task-tools'

vi.mock('@/lib/agents/tools/web-tools', () => ({
  executeWebSearch: vi.fn(async (_n: string, params: { query: string }) => {
    const q = String(params.query || '')
    if (/github|MCP|skill/i.test(q)) {
      return {
        ok: true,
        providers: ['duckduckgo'],
        results: [
          {
            title: 'awesome-mcp-servers (MIT)',
            url: 'https://github.com/punkpeye/awesome-mcp-servers',
            snippet: 'Free open source MCP server list',
          },
          {
            title: 'Paid Enterprise Connector',
            url: 'https://example.com/paid',
            snippet: 'Enterprise subscription pricing $99',
          },
        ],
      }
    }
    return { ok: false, providers: [], results: [] }
  }),
}))

describe('executeResearchTaskTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ranks free GitHub / MCP ahead of paid', async () => {
    const out = await executeResearchTaskTools('research_task_tools', {
      task: 'أتمتة متصفح بدون مفتاح',
    })
    expect(out.blocked).toBe(true)
    expect(out.messageAr).toContain('تعذّر تنفيذ المهمة بالأدوات الحالية.')
    expect(out.messageAr).toContain('أقترح (من الأرخص)')
    expect(out.suggestions[0]?.url).toContain('github.com')
    expect(out.suggestions[0]?.costRank).toBeLessThanOrEqual(
      out.suggestions[out.suggestions.length - 1]?.costRank ?? 99
    )
  })

  it('still returns MSA template when task empty', async () => {
    const out = await executeResearchTaskTools('research_task_tools', {})
    expect(out.blocked).toBe(true)
    expect(formatBlockedTaskReplyAr({ suggestions: [], researched: false }))
      .toContain('تعذّر تنفيذ المهمة')
    expect(out.messageAr).toContain('تعذّر تنفيذ المهمة')
  })
})
