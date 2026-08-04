/**
 * Playwright browser task for Mac sync agent.
 * Usage: node scripts/playwright-task.mjs <url> <task>
 * Once: npm i -D playwright && npx playwright install chromium
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const url = process.argv[2] || ''
const task = process.argv.slice(3).join(' ') || ''

async function main() {
  if (!url || !task) {
    console.log(
      JSON.stringify({
        ok: false,
        error: 'usage: playwright-task.mjs <url> <task>',
      })
    )
    process.exit(1)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        messageAr:
          'Playwright غير مثبت. على الماك: npm i -D playwright && npx playwright install chromium',
        extracted: {},
        currentUrl: url,
      })
    )
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  const logs = []
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    logs.push(`opened ${url}`)

    const pairs = [...task.matchAll(/([^\s=]+)\s*=\s*"([^"]+)"/g)]
    for (const m of pairs) {
      const name = m[1]
      const value = m[2]
      const loc = page
        .locator(
          `input[name="${name}"], input[id="${name}"], textarea[name="${name}"], [aria-label*="${name}"]`
        )
        .first()
      if ((await loc.count()) > 0) {
        await loc.fill(value)
        logs.push(`filled ${name}`)
      }
    }

    const clickMatch = task.match(/(?:اضغط|click)\s+["«]?([^"»\n]+)["»]?/i)
    if (clickMatch?.[1]) {
      const label = clickMatch[1].trim()
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') })
      if ((await btn.count()) > 0) {
        await btn.first().click()
        logs.push(`clicked ${label}`)
      } else {
        const link = page.getByRole('link', { name: new RegExp(label, 'i') })
        if ((await link.count()) > 0) {
          await link.first().click()
          logs.push(`clicked link ${label}`)
        }
      }
    }

    await page.waitForTimeout(1500)
    const title = await page.title()
    const text = await page.locator('body').innerText().catch(() => '')
    const shotPath = join(tmpdir(), `ab-pw-${Date.now()}.png`)
    await page.screenshot({ path: shotPath, fullPage: false })
    const screenshotBase64 = readFileSync(shotPath).toString('base64')

    console.log(
      JSON.stringify({
        ok: true,
        extracted: {
          title,
          preview: text.slice(0, 4000),
          task,
          hintAr:
            'مهمة Playwright شبه آلية — راجع اللقطة وأكمل التحقق اليدوي (HITL) للبوابات الحكومية.',
        },
        currentUrl: page.url(),
        screenshotBase64,
        logs,
        messageAr: 'نُفّذت خطوة Playwright على الماك — أكمل يدوياً إن لزم.',
      })
    )
  } catch (e) {
    console.log(
      JSON.stringify({
        ok: false,
        extracted: {},
        currentUrl: url,
        logs,
        error: e instanceof Error ? e.message : String(e),
        messageAr: 'فشل Playwright على الماك',
      })
    )
    process.exitCode = 1
  } finally {
    await browser.close().catch(() => {})
  }
}

main()
