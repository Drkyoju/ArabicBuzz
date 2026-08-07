import {
  getAssistant,
  matchAssistantByKeyword,
} from '@/lib/assistants/catalog'
import type { AssistantDef, AssistantId } from '@/lib/assistants/types'

export type IntentRouteResult = {
  assistantId: AssistantId
  assistant: AssistantDef
  matchedBy: 'keyword' | 'heuristic' | 'explicit' | 'default'
}

const HEURISTICS: Array<{ id: AssistantId; re: RegExp }> = [
  {
    id: 'inbox-zero',
    re: /بريد|جيميل|gmail|وارد|inbox|صف[ّر]?ر?\s*البريد|فرز\s*(ال)?بريد|اقرأ?\s*بريد|اقرا\s*بريد|رد\s*على\s*(ال)?مهم|مسود[ةه]\s*رد|ايميل|إيميل|email/,
  },
  {
    id: 'telegram-captain',
    re: /تيليجرام|تلجرام|telegram|tg\b/,
  },
  {
    id: 'file-office',
    re: /عد[ّ]?ل\s*(ال)?ملف|حو[ّ]?ل\s*(ال)?ملف|word|excel|pdf|pptx?|مكتب\s*الملفات/,
  },
  {
    id: 'file-search',
    re: /ابحث|بحث\s*(في)?\s*(ال)?ملفات|قاعدة\s*المعرفة|دور\s*في\s*الملفات/,
  },
  {
    id: 'daily-brief',
    re: /ملخص\s*يوم|أجندة|مواعيد\s*(اليوم|الغد)|تقويم|calendar|موجز/,
  },
  {
    id: 'day-captain',
    re: /كابتن\s*اليوم|نظ[ّ]?م\s*يوم|وش\s*عندي\s*اليوم|قائد\s*اليوم|يوم[ي]? كامل/,
  },
]

/**
 * Route free-text Arabic → specialized assistant prompt/tools.
 * User never picks boxes; keywords + light heuristics → general fallback.
 */
export function routeAssistantIntent(
  raw: string,
  explicitId?: string | null
): IntentRouteResult {
  if (explicitId) {
    const a = getAssistant(explicitId)
    if (a) {
      return {
        assistantId: a.id,
        assistant: a,
        matchedBy: 'explicit',
      }
    }
  }

  const byKw = matchAssistantByKeyword(raw)
  if (byKw) {
    return {
      assistantId: byKw.id,
      assistant: byKw,
      matchedBy: 'keyword',
    }
  }

  const t = raw.trim().toLowerCase()
  for (const h of HEURISTICS) {
    if (h.re.test(t)) {
      const a = getAssistant(h.id)
      if (a) {
        return {
          assistantId: a.id,
          assistant: a,
          matchedBy: 'heuristic',
        }
      }
    }
  }

  const general = getAssistant('general')!
  return {
    assistantId: 'general',
    assistant: general,
    matchedBy: 'default',
  }
}

/** Rough ETA (seconds) for sticky bar — not a promise. */
export function estimateAssistantEtaSeconds(assistantId: string): number {
  switch (assistantId) {
    case 'day-captain':
      return 50
    case 'inbox-zero':
      return 45
    case 'daily-brief':
      return 35
    case 'file-office':
      return 40
    case 'file-search':
      return 30
    case 'telegram-captain':
      return 25
    default:
      return 40
  }
}
