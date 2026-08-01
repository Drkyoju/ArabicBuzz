import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

type Check = { name: string; ok: boolean; detail: string }

const offline = process.argv.includes('--offline')

async function checkOpenRouter(key?: string): Promise<Check> {
  if (!key) return { name: 'OPENROUTER_API_KEY', ok: false, detail: 'missing' }
  if (offline) return { name: 'OPENROUTER_API_KEY', ok: true, detail: 'present (offline)' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    return {
      name: 'OPENROUTER_API_KEY',
      ok: res.ok,
      detail: res.ok ? 'valid' : `http ${res.status}`,
    }
  } catch (e) {
    return {
      name: 'OPENROUTER_API_KEY',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function checkGemini(key?: string): Promise<Check> {
  if (!key) return { name: 'GEMINI_API_KEY', ok: false, detail: 'missing' }
  if (offline) return { name: 'GEMINI_API_KEY', ok: true, detail: 'present (offline)' }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    )
    return {
      name: 'GEMINI_API_KEY',
      ok: res.ok,
      detail: res.ok ? 'valid' : `http ${res.status}`,
    }
  } catch (e) {
    return {
      name: 'GEMINI_API_KEY',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function checkTelegram(token?: string): Promise<Check> {
  if (!token) return { name: 'TELEGRAM_BOT_TOKEN', ok: false, detail: 'missing' }
  if (offline) return { name: 'TELEGRAM_BOT_TOKEN', ok: true, detail: 'present (offline)' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = (await res.json()) as { ok?: boolean }
    return {
      name: 'TELEGRAM_BOT_TOKEN',
      ok: Boolean(data.ok),
      detail: data.ok ? 'valid' : 'invalid',
    }
  } catch (e) {
    return {
      name: 'TELEGRAM_BOT_TOKEN',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function checkWhatsApp(token?: string): Promise<Check> {
  if (!token) return { name: 'WHATSAPP_TOKEN', ok: false, detail: 'missing' }
  if (offline) return { name: 'WHATSAPP_TOKEN', ok: true, detail: 'present (offline)' }
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!phoneId) {
    return { name: 'WHATSAPP_TOKEN', ok: true, detail: 'present (no phone id ping)' }
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return {
      name: 'WHATSAPP_TOKEN',
      ok: res.ok,
      detail: res.ok ? 'valid' : `http ${res.status}`,
    }
  } catch (e) {
    return {
      name: 'WHATSAPP_TOKEN',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function main() {
  const openai = process.env.OPENAI_API_KEY
  const checks = await Promise.all([
    checkOpenRouter(process.env.OPENROUTER_API_KEY),
    checkGemini(process.env.GEMINI_API_KEY),
    checkTelegram(process.env.TELEGRAM_BOT_TOKEN),
    checkWhatsApp(process.env.WHATSAPP_TOKEN),
    Promise.resolve({
      name: 'OPENAI_API_KEY',
      ok: Boolean(openai),
      detail: openai ? (offline ? 'present (offline)' : 'present') : 'missing',
    } satisfies Check),
  ])

  console.log('\nArabic Buzz env verification / التحقق من البيئة\n')
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
  }
  const failed = checks.filter((c) => !c.ok)
  if (failed.length) {
    console.error('\nFailed checks:', failed.map((f) => f.name).join(', '))
    process.exit(1)
  }
  console.log('\nAll required checks passed.')
}

void main()
