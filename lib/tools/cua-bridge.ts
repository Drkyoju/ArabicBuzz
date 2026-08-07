/**
 * Optional Cua Driver bridge — Netlify-safe remote computer/browser use.
 *
 * Cua (trycua/cua) does **not** run inside Netlify Functions. Locally you run:
 *   1) `cua-driver serve` (daemon / MCP)
 *   2) `npm run cua:bridge` — thin HTTP proxy that shells `cua-driver call …`
 *   3) Tunnel → set CUA_BRIDGE_URL (+ CUA_BRIDGE_SECRET) on Netlify
 *
 * Same pattern as MAC_SYNC / BROWSER_USE bridges.
 * Docs: https://cua.ai/cua-driver · https://github.com/trycua/cua
 */

export type CuaAction =
  | 'health_report'
  | 'list_windows'
  | 'list_apps'
  | 'check_permissions'
  | 'get_window_state'
  | 'get_browser_state'
  | 'browser_navigate'
  | 'browser_click'
  | 'browser_type'
  | 'browser_prepare'
  | 'click'
  | 'type_text'
  | 'double_click'
  | 'right_click'
  | 'scroll'
  | 'press_key'

export const CUA_READ_ONLY_ACTIONS = new Set<string>([
  'health_report',
  'list_windows',
  'list_apps',
  'check_permissions',
  'get_window_state',
  'get_browser_state',
])

export const CUA_ALLOWED_ACTIONS = new Set<string>([
  ...CUA_READ_ONLY_ACTIONS,
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_prepare',
  'click',
  'type_text',
  'double_click',
  'right_click',
  'scroll',
  'press_key',
])

export type CuaBridgeResult = {
  ok: boolean
  action?: string
  data?: unknown
  raw?: string
  logs: string[]
  messageAr: string
  online?: boolean
  configured?: boolean
}

function pushLog(logs: string[], line: string) {
  logs.push(`[${new Date().toISOString()}] ${line}`)
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, '')
}

export function getCuaBridgeConfig() {
  const baseUrl = normalizeBase(process.env.CUA_BRIDGE_URL?.trim() || '')
  const secret =
    process.env.CUA_BRIDGE_SECRET?.trim() ||
    process.env.MAC_SYNC_SECRET?.trim() ||
    process.env.BROWSER_USE_SECRET?.trim() ||
    ''
  return { baseUrl, secret }
}

export function cuaBridgeConfigured() {
  return Boolean(getCuaBridgeConfig().baseUrl)
}

async function cuaFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { baseUrl, secret } = getCuaBridgeConfig()
  if (!baseUrl) {
    throw new Error(
      'جسر Cua غير مضبوط. ثبّت Cua على جهازك ثم اربط العنوان هنا (CUA_BRIDGE_URL).'
    )
  }
  const headers = new Headers(init?.headers)
  if (secret) headers.set('Authorization', `Bearer ${secret}`)
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 60_000),
  })
}

/** Probe local/desktop Cua HTTP bridge (never claims Netlify-side desktop). */
export async function cuaHealth(): Promise<{
  ok: boolean
  configured: boolean
  online: boolean
  driver?: unknown
  error?: string
  messageAr: string
}> {
  const configured = cuaBridgeConfigured()
  if (!configured) {
    return {
      ok: false,
      configured: false,
      online: false,
      messageAr:
        'ثبّت Cua على جهازك ثم اربط العنوان هنا — لا يعمل داخل حاوية CranL مباشرة.',
    }
  }
  try {
    const res = await cuaFetch('/health', { timeoutMs: 8_000 })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      driver?: unknown
      agent?: string
      version?: string
      error?: string
      messageAr?: string
    }
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        configured: true,
        online: false,
        error: data.error || `HTTP ${res.status}`,
        messageAr:
          data.messageAr ||
          'جسر Cua مضبوط لكنه غير متصل. شغّل cua-driver serve ثم npm run cua:bridge والنفق.',
      }
    }
    return {
      ok: true,
      configured: true,
      online: true,
      driver: data.driver ?? { agent: data.agent, version: data.version },
      messageAr: 'جسر Cua متصل — يمكن للمساعد استخدام إجراءات المتصفح/سطح المكتب.',
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      configured: true,
      online: false,
      error: e instanceof Error ? e.message : 'error',
      messageAr: aborted
        ? 'جسر Cua لا يستجيب — تأكد أن cua:bridge والنفق يعملان على جهازك.'
        : 'تعذّر الاتصال بجسر Cua. ثبّت Cua على جهازك ثم اربط العنوان هنا.',
    }
  }
}

/**
 * Forward a single Cua MCP-style tool call through the local HTTP bridge.
 */
export async function executeCuaAction(
  action: string,
  args: Record<string, unknown> = {}
): Promise<CuaBridgeResult> {
  const logs: string[] = []
  const name = action.trim()
  if (!name) {
    return {
      ok: false,
      logs,
      configured: cuaBridgeConfigured(),
      messageAr: 'يلزم اسم الإجراء (action) — مثل browser_navigate أو health_report.',
    }
  }
  if (!CUA_ALLOWED_ACTIONS.has(name)) {
    return {
      ok: false,
      action: name,
      logs,
      configured: cuaBridgeConfigured(),
      messageAr: `الإجراء «${name}» غير مسموح من ArabicBuzz. استخدم إجراءات المتصفح/النوافذ الموثّقة.`,
    }
  }
  if (!cuaBridgeConfigured()) {
    return {
      ok: false,
      action: name,
      logs,
      configured: false,
      online: false,
      messageAr:
        'ثبّت Cua على جهازك ثم اربط العنوان هنا (CUA_BRIDGE_URL). لا يعمل داخل حاوية CranL.',
    }
  }

  pushLog(logs, `cua action=${name}`)
  try {
    const res = await cuaFetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: name, tool: name, args, arguments: args }),
      timeoutMs: 90_000,
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      data?: unknown
      result?: unknown
      raw?: string
      logs?: string[]
      error?: string
      messageAr?: string
    }
    if (Array.isArray(data.logs)) {
      for (const l of data.logs) pushLog(logs, String(l))
    }
    if (!res.ok || data.ok === false) {
      pushLog(logs, data.error || `HTTP ${res.status}`)
      return {
        ok: false,
        action: name,
        data: data.data ?? data.result,
        raw: data.raw,
        logs,
        configured: true,
        online: res.status !== 0,
        messageAr:
          data.messageAr ||
          data.error ||
          `فشل إجراء Cua (HTTP ${res.status}). راجع الجسر المحلي.`,
      }
    }
    return {
      ok: true,
      action: name,
      data: data.data ?? data.result ?? data,
      raw: data.raw,
      logs,
      configured: true,
      online: true,
      messageAr: data.messageAr || `اكتمل إجراء Cua: ${name}`,
    }
  } catch (e) {
    pushLog(logs, e instanceof Error ? e.message : 'error')
    return {
      ok: false,
      action: name,
      logs,
      configured: true,
      online: false,
      messageAr:
        'جسر Cua غير متصل. ثبّت Cua على جهازك (cua.ai) ثم شغّل npm run cua:bridge واربط CUA_BRIDGE_URL.',
    }
  }
}

export function cuaStatusAr(online: boolean, configured: boolean): string {
  if (!configured) return 'غير متصل'
  return online ? 'متصل' : 'غير متصل'
}
