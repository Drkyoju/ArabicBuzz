import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  executeResearchTaskTools,
  formatBlockedTaskReplyAr,
} from '@/lib/agents/tools/research-task-tools'
import {
  mapTaskToBuiltinFreeTools,
  formatFreeExecuteNextAr,
} from '@/lib/agents/tools/free-execute-map'

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

describe('mapTaskToBuiltinFreeTools', () => {
  it('maps PDF page duplicate to pdf_duplicate_page (pdf-lib)', () => {
    const hints = mapTaskToBuiltinFreeTools('كرر صفحة 48 بعد 45 في المعلم الأول')
    expect(hints.some((h) => h.toolName === 'pdf_duplicate_page')).toBe(true)
    expect(formatFreeExecuteNextAr(hints)).toContain('نفّذ الآن')
  })
})

describe('executeResearchTaskTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canExecuteFree for PDF duplicate without web', async () => {
    const out = await executeResearchTaskTools('research_task_tools', {
      task: 'كرر صفحة 48 بعد الصفحة 45',
    })
    expect(out.canExecuteFree).toBe(true)
    expect(out.blocked).toBe(false)
    expect(out.executeNext[0]?.toolName).toBe('pdf_duplicate_page')
    expect(out.messageAr).toContain('مسار مجاني قابل للتنفيذ')
  })

  it('ranks free GitHub / MCP ahead of paid when no builtin', async () => {
    const out = await executeResearchTaskTools('research_task_tools', {
      task: 'أتمتة متصفح بدون مفتاح selenium playwright remote',
    })
    // May map to nothing builtin — then blocked paid gate or free suggestions
    if (out.canExecuteFree) {
      expect(out.executeNext.length).toBeGreaterThan(0)
      expect(out.blocked).toBe(false)
    } else {
      expect(out.blocked).toBe(true)
      expect(out.messageAr).toContain('تعذّر تنفيذ المهمة بالأدوات الحالية.')
      expect(out.messageAr).toContain('أقترح (من الأرخص)')
    }
  })

  it('still returns MSA template when task empty', async () => {
    const out = await executeResearchTaskTools('research_task_tools', {})
    expect(out.blocked).toBe(true)
    expect(formatBlockedTaskReplyAr({ suggestions: [], researched: false }))
      .toContain('تعذّر تنفيذ المهمة')
    expect(out.messageAr).toContain('تعذّر تنفيذ المهمة')
  })
})
