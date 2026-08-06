import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

type Check = { name: string; ok: boolean; detail: string }

const offline = process.argv.includes('--offline')

async function checkOpenRouter(_key?: string): Promise<Check> {
  return {
    name: 'OPENROUTER_API_KEY',
    ok: true,
    detail: 'retired — removed from product',
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

async function checkSupabase(): Promise<Check> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) {
    return {
      name: 'SUPABASE',
      ok: false,
      detail: 'missing URL or anon key (optional until Auth/webhooks)',
    }
  }
  if (offline) {
    return { name: 'SUPABASE', ok: true, detail: 'present (offline)' }
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: anon },
    })
    return {
      name: 'SUPABASE',
      ok: res.ok || res.status === 401,
      detail: res.ok || res.status === 401 ? 'reachable' : `http ${res.status}`,
    }
  } catch (e) {
    return {
      name: 'SUPABASE',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function checkAgentRouter(key?: string): Promise<Check> {
  if (!key) return { name: 'AGENTROUTER_API_KEY', ok: false, detail: 'missing' }
  if (offline)
    return { name: 'AGENTROUTER_API_KEY', ok: true, detail: 'present (offline)' }
  try {
    const res = await fetch('https://agentrouter.org/v1/models', {
      headers: {
        Authorization: `Bearer ${key}`,
        'x-api-key': key,
        'User-Agent': 'claude-cli/2.1.158 (external, sdk-cli)',
        'x-app': 'cli',
      },
    })
    return {
      name: 'AGENTROUTER_API_KEY',
      ok: res.ok,
      detail: res.ok ? 'valid' : `http ${res.status}`,
    }
  } catch (e) {
    return {
      name: 'AGENTROUTER_API_KEY',
      ok: false,
      detail: e instanceof Error ? e.message : 'error',
    }
  }
}

async function main() {
  const checks = await Promise.all([
    checkGemini(process.env.GEMINI_API_KEY),
    checkAgentRouter(process.env.AGENTROUTER_API_KEY),
    checkTelegram(process.env.TELEGRAM_BOT_TOKEN),
    checkWhatsApp(process.env.WHATSAPP_TOKEN),
    checkSupabase(),
  ])

  console.log('\nArabic Buzz env verification / التحقق من البيئة\n')
  for (const c of checks) {
    // Supabase is soft-fail until the project is linked
    if (c.name === 'SUPABASE' && !c.ok) {
      console.log(`· ${c.name}: ${c.detail}`)
      continue
    }
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
  }
  const failed = checks.filter((c) => !c.ok && c.name !== 'SUPABASE')
  if (failed.length) {
    console.error('\nFailed checks:', failed.map((f) => f.name).join(', '))
    process.exit(1)
  }
  console.log('\nAll required checks passed.')
}

void main()
