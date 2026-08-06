/**
 * Register (or update) the live Telegram webhook with optional secret_token.
 *
 * Usage:
 *   npx tsx scripts/set-telegram-webhook.ts
 *
 * Requires TELEGRAM_BOT_TOKEN. Uses TELEGRAM_WEBHOOK_SECRET when set
 * (recommended). Default URL: https://arabicbuzz.netlify.app/api/webhooks/telegram
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config() // fallback .env

async function main() {
  let token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  let secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()

  // Always prefer Netlify live secret when CLI credentials exist — local
  // TELEGRAM_WEBHOOK_SECRET often drifts and re-registers a mismatched
  // secret_token → Telegram gets 401 from /api/webhooks/telegram.
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/env`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,
        },
      }
    )
    if (res.ok) {
      const list = (await res.json()) as Array<{
        key: string
        values?: Array<{ value?: string }>
      }>
      const get = (k: string) =>
        list.find((e) => e.key === k)?.values?.[0]?.value?.trim()
      const netToken = get('TELEGRAM_BOT_TOKEN')
      const netSecret = get('TELEGRAM_WEBHOOK_SECRET')
      if (netToken) {
        token = netToken
        process.env.TELEGRAM_BOT_TOKEN = netToken
      }
      if (netSecret) {
        secret = netSecret
        process.env.TELEGRAM_WEBHOOK_SECRET = netSecret
      }
    }
  }

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN missing')
    process.exit(1)
  }

  const url =
    process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
    `${(process.env.NEXT_PUBLIC_APP_URL || 'https://arabicbuzz.netlify.app').replace(/\/+$/, '')}/api/webhooks/telegram`

  const body: Record<string, unknown> = {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  }
  if (secret) body.secret_token = secret

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok?: boolean; description?: string }
  console.log(
    JSON.stringify({ url, secretConfigured: Boolean(secret), result: json }, null, 2)
  )
  if (!json.ok) process.exit(1)

  const infoRes = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`
  )
  const info = await infoRes.json()
  console.log('getWebhookInfo:', JSON.stringify(info, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
