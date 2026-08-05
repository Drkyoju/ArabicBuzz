/**
 * Executes the vendored Arabic function-calling subset against a live model.
 *
 * Shared by `npm run test:evals:arabic-fc` and the combined `npm run test:evals`
 * so both report the same metrics.
 */
import fs from 'fs'
import path from 'path'
import { generateText, stepCountIs, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import {
  ARABIC_FC_DATASET_FILE,
  ARABIC_FC_SYSTEM_AR,
  aggregateArabicFc,
  scoreArabicFcItem,
  type ArabicFcDataset,
  type ArabicFcItem,
  type ArabicFcItemResult,
} from '@/lib/evals/arabic-fc'

export type ArabicFcOutcome =
  | { status: 'skipped'; reason: string }
  | {
      status: 'pass' | 'fail'
      modelSlug: string
      aggregates: ReturnType<typeof aggregateArabicFc>
      errored: number
      results: ArabicFcItemResult[]
      thresholds: ArabicFcDataset['thresholds']
      summaryText: string
    }

export function loadArabicFcDataset(): ArabicFcDataset | null {
  const file = path.join(process.cwd(), ARABIC_FC_DATASET_FILE)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ArabicFcDataset
}

function hasProviderKey() {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GLM_API_KEY ||
      process.env.OLLAMA_BASE_URL
  )
}

function buildToolSet(dataset: ArabicFcDataset): ToolSet {
  const set: ToolSet = {}
  for (const fn of dataset.functions) {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, type] of Object.entries(fn.parameters)) {
      const base =
        type === 'number'
          ? z.number()
          : type === 'boolean'
            ? z.boolean()
            : z.string()
      shape[key] = base.optional()
    }
    set[fn.name] = tool({
      description: fn.descriptionAr,
      inputSchema: z.object(shape),
      // Never executed: the suite stops after the first tool decision.
      execute: async (args) => ({ ok: true, args }),
    })
  }
  return set
}

async function evaluateOne(
  item: ArabicFcItem,
  tools: ToolSet,
  modelSlug: string
): Promise<{ result?: ArabicFcItemResult; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const out = await generateText({
        model: getHarnessModel(modelSlug),
        system: ARABIC_FC_SYSTEM_AR,
        prompt: item.promptAr,
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(1),
      })
      const calls = out.steps?.[0]?.toolCalls ?? out.toolCalls ?? []
      const names = calls.map((c) => String(c.toolName))
      const firstArgs =
        calls[0] && typeof calls[0].input === 'object'
          ? (calls[0].input as Record<string, unknown>)
          : null
      return { result: scoreArabicFcItem(item, names, firstArgs) }
    } catch (e) {
      if (attempt === 2) {
        return { error: e instanceof Error ? e.message : 'model error' }
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  return { error: 'unreachable' }
}

export async function runArabicFcSuite(opts?: {
  modelSlug?: string
  limit?: number
  concurrency?: number
  log?: (line: string) => void
}): Promise<ArabicFcOutcome> {
  const log = opts?.log || (() => {})
  const dataset = loadArabicFcDataset()
  if (!dataset) {
    return {
      status: 'skipped',
      reason: `${ARABIC_FC_DATASET_FILE} غير موجود — نفّذ npm run evals:fetch-arabic-fc`,
    }
  }
  if (!hasProviderKey()) {
    return {
      status: 'skipped',
      reason:
        'لا يوجد مفتاح مزوّد (GEMINI_API_KEY / OPENROUTER_API_KEY …) — تقييم استدعاء الأدوات يحتاج نموذجاً حياً',
    }
  }

  const modelSlug =
    opts?.modelSlug ||
    process.env.EVAL_MODEL ||
    process.env.DEFAULT_HARNESS_MODEL ||
    'gemini-3.1-pro'
  const items = opts?.limit
    ? dataset.items.slice(0, opts.limit)
    : dataset.items
  const tools = buildToolSet(dataset)
  const concurrency = Math.max(1, opts?.concurrency ?? 4)

  log('\n══════════════════════════════════════════════')
  log(' Arabic function calling — MSA tool routing')
  log('══════════════════════════════════════════════')
  log(` Source: ${dataset.source} v${dataset.version}`)
  log(` Items:  ${items.length} · Functions: ${dataset.functions.length}`)
  log(` Model:  ${modelSlug}`)
  log('──────────────────────────────────────────────')

  const results: ArabicFcItemResult[] = []
  const errors: string[] = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++]
      const { result, error } = await evaluateOne(item, tools, modelSlug)
      if (result) {
        results.push(result)
        log(
          `→ ${item.id} [${item.category}] ${result.passed ? 'PASS' : 'FAIL'} ${result.details}`
        )
      } else {
        errors.push(`${item.id}: ${error}`)
        log(`→ ${item.id} [${item.category}] ERROR ${error}`)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )

  const agg = aggregateArabicFc(results)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const passed =
    results.length > 0 &&
    agg.toolSelectionAccuracy >= dataset.thresholds.toolSelectionAccuracy &&
    agg.abstentionAccuracy >= dataset.thresholds.abstentionAccuracy

  const summaryText = [
    '',
    '──────────────────────────────────────────────',
    ' Arabic function-calling aggregates',
    '──────────────────────────────────────────────',
    ` ToolSelectionAccuracy : ${pct(agg.toolSelectionAccuracy)} (gate ${pct(dataset.thresholds.toolSelectionAccuracy)})`,
    ` AbstentionAccuracy    : ${pct(agg.abstentionAccuracy)} (gate ${pct(dataset.thresholds.abstentionAccuracy)})`,
    ` ArgumentKeyRecall     : ${pct(agg.argKeyRecall)}`,
    ` Scored/Errored        : ${results.length}/${errors.length}`,
    '──────────────────────────────────────────────',
    passed
      ? `PASS: Arabic function calling met its gates on ${modelSlug}.`
      : `FAIL: Arabic function calling below gate on ${modelSlug}.`,
    '',
  ].join('\n')

  return {
    status: passed ? 'pass' : 'fail',
    modelSlug,
    aggregates: agg,
    errored: errors.length,
    results,
    thresholds: dataset.thresholds,
    summaryText,
  }
}
