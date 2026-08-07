/**
 * Live CranL API smoke — works without Playwright browsers (e.g. macOS Monterey).
 * Usage: npm run test:live-smoke
 */
const BASE =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  'https://arabicbuzz-fooc9h.cranl.net'

async function check(
  name: string,
  path: string,
  assert: (status: number, body: unknown) => void
) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json, text/html' },
  })
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '')
  assert(res.status, body)
  console.log(`✓ ${name} (${res.status})`)
}

async function main() {
  console.log(`Live smoke → ${BASE}`)
  let failed = 0

  try {
    await check('public-config', '/api/public-config', (status, body) => {
      if (status !== 200) throw new Error(`status ${status}`)
      const b = body as { supabaseConfigured?: boolean; appUrl?: string }
      if (!b.supabaseConfigured) throw new Error('supabaseConfigured=false')
      if (!String(b.appUrl || '').includes('cranl.net')) {
        throw new Error(`unexpected appUrl ${b.appUrl}`)
      }
    })
  } catch (e) {
    failed++
    console.error('✗ public-config', e)
  }

  try {
    await check('health/live', '/api/health/live', (status, body) => {
      if (status !== 200) throw new Error(`status ${status}`)
      const b = body as { ok?: boolean; status?: string }
      if (!b.ok || b.status !== 'live') throw new Error('not live')
    })
  } catch (e) {
    failed++
    console.error('✗ health/live', e)
  }

  try {
    await check('health/ready', '/api/health/ready', (status, body) => {
      if (status !== 200 && status !== 503) throw new Error(`status ${status}`)
      if (!body || typeof body !== 'object') throw new Error('empty body')
      if (status === 503) {
        console.warn('  (ready returned 503 — deps may be warming)')
      }
    })
  } catch (e) {
    failed++
    console.error('✗ health/ready', e)
  }

  try {
    await check('health/free', '/api/health/free', (status, body) => {
      if (status !== 200) throw new Error(`status ${status}`)
      if (!body || typeof body !== 'object') throw new Error('empty body')
    })
  } catch (e) {
    failed++
    console.error('✗ health/free', e)
  }

  try {
    await check('telegram webhook', '/api/webhooks/telegram', (status) => {
      if (status >= 500) throw new Error(`status ${status}`)
    })
  } catch (e) {
    failed++
    console.error('✗ telegram webhook', e)
  }

  try {
    await check('home html', '/', (status, body) => {
      if (status !== 200) throw new Error(`status ${status}`)
      const html = String(body)
      if (!/lang=["']ar["']/i.test(html)) throw new Error('missing lang=ar')
      if (!/dir=["']rtl["']/i.test(html)) throw new Error('missing dir=rtl')
    })
  } catch (e) {
    failed++
    console.error('✗ home html', e)
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll live smoke checks passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
