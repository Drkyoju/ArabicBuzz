/**
 * Vendor a CI-sized subset of HeshamHaroon/Arabic_Function_Calling.
 *
 * The upstream dataset is ~50k rows across five dialects; CI only needs a
 * balanced MSA slice that exercises tool selection and abstention.
 *
 * Usage:
 *   npm run evals:fetch-arabic-fc
 *   npm run evals:fetch-arabic-fc -- --per-function 3 --negatives 20 --split test
 *
 * Writes tests/evals/arabic-function-calling.json (committed to the repo so
 * `npm run test:evals` never needs network access).
 */
import fs from 'fs'
import path from 'path'
import {
  ARABIC_FC_DATASET_FILE,
  ARABIC_FC_FUNCTION_DESCRIPTIONS_AR,
  type ArabicFcDataset,
  type ArabicFcFunction,
  type ArabicFcItem,
} from '@/lib/evals/arabic-fc'

const DATASET = 'HeshamHaroon/Arabic_Function_Calling'
const CONFIG = 'default'
const SERVER = 'https://datasets-server.huggingface.co'

type Row = {
  id: string
  query_ar: string
  query_en: string
  function_name: string
  arguments: string
  dialect: string
  domain: string
  requires_function: boolean
}

function argValue(name: string, fallback: string) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return fallback
  return process.argv[idx + 1] || fallback
}

/** datasets-server warms an index on first use per filter — retry patiently. */
async function filterRows(where: string, limit: number): Promise<Row[]> {
  const url = new URL(`${SERVER}/filter`)
  url.searchParams.set('dataset', DATASET)
  url.searchParams.set('config', CONFIG)
  url.searchParams.set('split', argValue('split', 'train'))
  url.searchParams.set('where', where)
  url.searchParams.set('limit', String(limit))

  let lastError = 'unknown'
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (res.ok) {
        const data = (await res.json()) as { rows?: Array<{ row: Row }> }
        return (data.rows || []).map((r) => r.row)
      }
      lastError = `HTTP ${res.status}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'fetch error'
    }
    await new Promise((r) => setTimeout(r, attempt * 3000))
  }
  console.warn(`  ! filter failed (${lastError}): ${where}`)
  return []
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function jsonType(v: unknown): 'string' | 'number' | 'boolean' {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  return 'string'
}

async function main() {
  const perFunction = Number(argValue('per-function', '3'))
  const negatives = Number(argValue('negatives', '18'))
  const functionNames = Object.keys(ARABIC_FC_FUNCTION_DESCRIPTIONS_AR)

  const items: ArabicFcItem[] = []
  const paramTypes = new Map<string, Map<string, string>>()
  const seenPrompts = new Set<string>()

  for (const fn of functionNames) {
    // Over-fetch: MSA rows repeat template queries, so dedupe then trim.
    const rows = await filterRows(
      `"dialect"='MSA' AND "requires_function"=true AND "function_name"='${fn}'`,
      perFunction * 8
    )
    let taken = 0
    for (const row of rows) {
      const promptAr = row.query_ar?.trim()
      if (!promptAr || seenPrompts.has(promptAr)) continue
      seenPrompts.add(promptAr)
      const args = parseArgs(row.arguments)
      const types =
        paramTypes.get(fn) || new Map<string, string>()
      for (const [k, v] of Object.entries(args)) {
        if (!types.has(k)) types.set(k, jsonType(v))
      }
      paramTypes.set(fn, types)
      items.push({
        id: row.id,
        category: 'tool_selection',
        promptAr,
        expectedFunction: fn,
        expectedArgs: args,
        domain: row.domain || 'unknown',
        dialect: row.dialect || 'MSA',
      })
      taken += 1
      if (taken >= perFunction) break
    }
    if (taken === 0) {
      console.warn(`  ! no MSA rows found for ${fn}`)
    }
    process.stdout.write(`  ${fn}: ${taken}\n`)
  }

  // MSA abstention prompts are heavily templated (only a handful of distinct
  // queries), so top up from the other dialects to get a usable sample.
  let negTaken = 0
  for (const where of [
    `"dialect"='MSA' AND "requires_function"=false`,
    `"requires_function"=false`,
  ]) {
    if (negTaken >= negatives) break
    const negRows = await filterRows(where, negatives * 20)
    for (const row of negRows) {
      const promptAr = row.query_ar?.trim()
      if (!promptAr || seenPrompts.has(promptAr)) continue
      seenPrompts.add(promptAr)
      items.push({
        id: row.id,
        category: 'anti_hallucination',
        promptAr,
        expectedFunction: null,
        domain: row.domain || 'unknown',
        dialect: row.dialect || 'unknown',
      })
      negTaken += 1
      if (negTaken >= negatives) break
    }
  }
  console.log(`  negatives: ${negTaken}`)

  const functions: ArabicFcFunction[] = functionNames
    .filter((fn) => paramTypes.has(fn))
    .map((fn) => ({
      name: fn,
      descriptionAr: ARABIC_FC_FUNCTION_DESCRIPTIONS_AR[fn],
      parameters: Object.fromEntries(paramTypes.get(fn) || []) as Record<
        string,
        'string' | 'number' | 'boolean'
      >,
    }))

  const dataset: ArabicFcDataset = {
    version: '1.0.0',
    name: 'Arabic function calling (MSA subset)',
    source: DATASET,
    sourceUrl: `https://huggingface.co/datasets/${DATASET}`,
    licenseNoteAr:
      'مجموعة بيانات عامة على Hugging Face — مقتطف MSA فقط لأغراض التقييم في CI.',
    dialectNoteAr:
      'بنود اختيار الأداة بالفصحى (MSA) فقط؛ بنود الامتناع تشمل لهجات أخرى لقلة عدد الصيغ الفصحى المتاحة.',
    generatedAt: new Date().toISOString(),
    thresholds: {
      toolSelectionAccuracy: 0.7,
      abstentionAccuracy: 0.7,
    },
    functions,
    items,
  }

  const out = path.join(process.cwd(), ARABIC_FC_DATASET_FILE)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(
    `\nWrote ${out}: ${items.length} items · ${functions.length} functions`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
