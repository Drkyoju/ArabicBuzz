/**
 * Arabic function-calling eval runner (MSA tool routing + abstention).
 *
 * Usage:
 *   npm run test:evals:arabic-fc
 *   npm run test:evals:arabic-fc -- --model gemini-3.1-pro --limit 20
 *
 * Requires one provider key (GEMINI_API_KEY / OPENROUTER_API_KEY / …). Without
 * a key it exits 0 and reports SKIPPED so CI stays green on forks.
 */
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { runArabicFcSuite } from '@/lib/evals/arabic-fc-runner'

function argValue(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return fallback
  return process.argv[idx + 1] || fallback
}

async function main() {
  const limitRaw = argValue('limit')
  const outcome = await runArabicFcSuite({
    modelSlug: argValue('model'),
    limit: limitRaw ? Number(limitRaw) : undefined,
    concurrency: Number(argValue('concurrency', '4')),
    log: (line) => console.log(line),
  })

  if (outcome.status === 'skipped') {
    console.log(`\nSKIPPED: ${outcome.reason}\n`)
    process.exit(0)
  }

  console.log(outcome.summaryText)
  process.exit(outcome.status === 'pass' ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
