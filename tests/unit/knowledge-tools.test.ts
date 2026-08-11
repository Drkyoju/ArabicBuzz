import { describe, expect, it } from 'vitest'
import {
  evaluateMathExpression,
  extractYoutubeVideoId,
  normalizeWaybackUrl,
} from '@/lib/agents/tools/knowledge-tools'
import { mapTaskToBuiltinFreeTools } from '@/lib/agents/tools/free-execute-map'
import { buildTelegramHelpDomainAr } from '@/lib/telegram/help-copy'
import { EMPLOYEE_SAFE_TOOLS } from '@/lib/agents/tools-by-role'
import { TELEGRAM_SITE_CHAT_TOOLS } from '@/lib/telegram/power-path'
import {
  EXCELLENT_FREE_TOOLKIT,
  freeToolkitReadyIds,
} from '@/lib/agents/free-toolkit'

describe('knowledge-tools pure helpers', () => {
  it('extracts YouTube ids from urls and bare ids', () => {
    expect(extractYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    )
    expect(
      extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('not-a-video')).toBeNull()
  })

  it('evaluates safe math expressions', () => {
    expect(evaluateMathExpression('2*(3+4)')).toBe(14)
    expect(evaluateMathExpression('sqrt(16)+2')).toBe(6)
    expect(evaluateMathExpression('2^10')).toBe(1024)
    expect(evaluateMathExpression('min(3,1,2)')).toBe(1)
    expect(() => evaluateMathExpression('process.exit(1)')).toThrow()
  })

  it('normalizes wayback urls', () => {
    expect(normalizeWaybackUrl('https://example.com/a')).toMatch(/^https:\/\//)
    expect(normalizeWaybackUrl('example.com')).toMatch(/^https:\/\/example\.com/)
    expect(normalizeWaybackUrl('')).toBeNull()
    expect(normalizeWaybackUrl('ftp://x')).toBeNull()
  })
})

describe('free-execute-map knowledge parity', () => {
  it('maps wikipedia / youtube / math / domain / arxiv tasks', () => {
    expect(
      mapTaskToBuiltinFreeTools('ويكيبيديا الوقف').some(
        (h) => h.toolName === 'wikipedia_lookup'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('لخّص اليوتيوب https://youtu.be/dQw4w9WgXcQ').some(
        (h) => h.toolName === 'youtube_transcript'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('احسب 12*7+3').some(
        (h) => h.toolName === 'math_eval'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('استعلم النطاق example.com whois').some(
        (h) => h.toolName === 'domain_intel'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('ابحث في arXiv عن transformers').some(
        (h) => h.toolName === 'arxiv_search'
      )
    ).toBe(true)
  })
})

describe('telegram / role surfaces include knowledge tools', () => {
  it('lists new tools in help, employee allowlist, and chat subset', () => {
    const search = buildTelegramHelpDomainAr('search')
    expect(search).toMatch(/wikipedia_lookup/)
    expect(search).toMatch(/youtube_transcript/)
    expect(search).toMatch(/math_eval/)
    expect(search).toMatch(/domain_intel/)
    expect(search).toMatch(/arxiv_search/)
    expect(search).toMatch(/fx_rate/)
    expect(search).toMatch(/geocode/)
    expect(search).toMatch(/dictionary_lookup/)
    expect(search).toMatch(/hn_search/)
    expect(search).toMatch(/saudi_datetime/)
    expect(search).toMatch(/wayback_lookup/)

    for (const name of [
      'wikipedia_lookup',
      'youtube_transcript',
      'math_eval',
      'domain_intel',
      'arxiv_search',
      'fx_rate',
      'geocode',
      'dictionary_lookup',
      'hn_search',
      'saudi_datetime',
      'wayback_lookup',
    ] as const) {
      expect(EMPLOYEE_SAFE_TOOLS).toContain(name)
      expect(TELEGRAM_SITE_CHAT_TOOLS).toContain(name)
    }
  })
})

describe('free-execute-map extra public tools', () => {
  it('maps fx / geocode / dictionary / hn / saudi_datetime / wayback', () => {
    expect(
      mapTaskToBuiltinFreeTools('حوّل 100 دولار لريال').some(
        (h) => h.toolName === 'fx_rate'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('أين تقع الرياض geocode').some(
        (h) => h.toolName === 'geocode'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('خريطة برج المملكة').some(
        (h) => h.toolName === 'geocode'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('أنشئ ملف مذكرة من الصفر').some(
        (h) => h.toolName === 'write_file'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('define endowment dictionary').some(
        (h) => h.toolName === 'dictionary_lookup'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('ابحث في Hacker News عن mcp').some(
        (h) => h.toolName === 'hn_search'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('كم التاريخ الهجري بتوقيت الرياض').some(
        (h) => h.toolName === 'saudi_datetime'
      )
    ).toBe(true)
    expect(
      mapTaskToBuiltinFreeTools('wayback أرشيف الويب للرابط').some(
        (h) => h.toolName === 'wayback_lookup'
      )
    ).toBe(true)
  })
})

describe('excellent free toolkit checklist', () => {
  it('marks core knowledge + FX/geo capabilities ready on both sides', () => {
    const ready = new Set(freeToolkitReadyIds())
    for (const id of [
      'web_search',
      'wikipedia',
      'youtube',
      'math',
      'domain',
      'arxiv',
      'fx',
      'geocode',
      'dictionary',
      'hn',
      'saudi_datetime',
      'wayback',
      'pdf_read_ocr',
    ]) {
      expect(ready.has(id)).toBe(true)
    }
    expect(EXCELLENT_FREE_TOOLKIT.every((i) => i.bothReady)).toBe(true)
  })
})
