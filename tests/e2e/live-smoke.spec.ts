import { expect, test } from '@playwright/test'

/**
 * Product QA against live CranL only (see docs/cranl-deploy.md).
 */
test.describe('CranL live smoke', () => {
  test('public-config returns supabaseConfigured', async ({ request }) => {
    const res = await request.get('/api/public-config')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.supabaseConfigured).toBe(true)
    expect(String(body.supabaseUrl || '')).toMatch(/^https:\/\//)
    expect(String(body.appUrl || '')).toMatch(/cranl\.net/)
  })

  test('health/free is healthy enough to boot', async ({ request }) => {
    const res = await request.get('/api/health/free')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('supabaseOk')
    expect(body).toHaveProperty('freeReady')
  })

  test('telegram webhook endpoint responds', async ({ request }) => {
    const res = await request.get('/api/webhooks/telegram')
    expect(res.status()).toBeLessThan(500)
  })

  test('home renders RTL Arabic shell', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    // Brand / shell should be present without covering content incorrectly
    await expect(page.locator('body')).toBeVisible()
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('body')).toContainText(/دخول|تسجيل|Google|بريد/i)
  })
})
