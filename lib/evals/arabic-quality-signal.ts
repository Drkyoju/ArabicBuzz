/**
 * Arabic MSA quality *signal* for ops/health — grounded in real config,
 * not invented benchmark scores.
 */

import { expandArabicQueryTokens } from '@/lib/rag/arabic-synonyms'
import { isHitlDisabled } from '@/lib/security/posture'

export type ArabicQualitySignal = {
  /** Human-readable badge for UI */
  badgeAr: string
  /** Short status line */
  detailAr: string
  /** Checklist of real capabilities (true = present in code/env) */
  checks: Array<{ id: string; labelAr: string; ok: boolean }>
  /** Count of checks that pass */
  readyCount: number
  totalCount: number
}

/** Probe that synonym expansion is wired (deterministic, no LLM). */
function synonymExpansionReady(): boolean {
  const tokens = expandArabicQueryTokens('ترخيص الجمعية العمومية')
  return tokens.some((t) => t.includes('رخصة') || t.includes('جلسة'))
}

export function buildArabicQualitySignal(): ArabicQualitySignal {
  const checks = [
    {
      id: 'msa_prompts',
      labelAr: 'تعليمات الفصحى في الوكيل',
      ok: true, // shipped in engine/pipeline/telegram
    },
    {
      id: 'synonyms',
      labelAr: 'توسيع مرادفات الجمعيات في البحث',
      ok: synonymExpansionReady(),
    },
    {
      id: 'citations',
      labelAr: 'استشهاد المصادر في RAG',
      ok: true, // formatArabicCitations + room chips
    },
    {
      id: 'hitl_governance',
      labelAr: 'حوكمة الموافقات (HITL) مفعّلة',
      ok: !isHitlDisabled(),
    },
    {
      id: 'telegram_ops',
      labelAr: 'قناة تيليجرام للتشغيل',
      ok: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    },
  ]

  const readyCount = checks.filter((c) => c.ok).length
  const totalCount = checks.length

  let badgeAr = 'فصحى · أساسي'
  if (readyCount >= 4) badgeAr = 'فصحى · جاهز للجمعيات'
  else if (readyCount >= 3) badgeAr = 'فصحى · جيد'

  const detailAr = [
    `${readyCount}/${totalCount} إشارات جودة عربية مفعّلة`,
    isHitlDisabled()
      ? '— فعّل HITL_DISABLED=0 للحوكمة الكاملة'
      : '— الموافقات البشرية مفعّلة',
  ].join(' ')

  return { badgeAr, detailAr, checks, readyCount, totalCount }
}
