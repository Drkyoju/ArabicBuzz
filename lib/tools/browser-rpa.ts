/**
 * Browser RPA bridge — Netlify-safe remote automation.
 *
 * browser-use (Python) and Playwright cannot run inside Netlify functions.
 * This module talks to a remote runner:
 * Preference order:
 *  1) BROWSER_USE_URL — dedicated browser-use bridge
 *  2) MAC_SYNC_URL — Mac sync agent POST /task (browser-use first, Playwright fallback)
 *  3) STEEL_API_KEY — Steel.dev cloud browser sessions
 *
 * Unreachable bridges fall through to the next provider.
 * GitHub refs: browser-use/browser-use · steel-dev/steel-sdk
 */

export type BrowserTaskResult = {
  ok: boolean
  extracted: Record<string, unknown>
  currentUrl: string | null
  screenshotBase64?: string | null
  pdfBase64?: string | null
  logs: string[]
  messageAr: string
  provider?: 'browser-use' | 'mac-sync' | 'steel' | 'none'
}

function pushLog(logs: string[], line: string) {
  logs.push(`[${new Date().toISOString()}] ${line}`)
}

type BridgeCall = {
  base: string
  secret: string
  label: 'browser-use' | 'mac-sync'
}

async function viaHttpBridge(
  bridge: BridgeCall,
  taskPrompt: string,
  targetUrl: string,
  logs: string[]
): Promise<BrowserTaskResult | null> {
  const engine =
    (process.env.BROWSER_ENGINE as 'playwright' | 'browser-use' | 'auto') ||
    'auto'
  pushLog(
    logs,
    `Calling ${bridge.label} bridge ${bridge.base} (engine=${engine})`
  )
  try {
    const res = await fetch(`${bridge.base}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bridge.secret
          ? { Authorization: `Bearer ${bridge.secret}` }
          : {}),
      },
      body: JSON.stringify({
        task: taskPrompt,
        url: targetUrl,
        maxSteps: Number(process.env.BROWSER_USE_MAX_STEPS || 25),
        engine,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      pushLog(logs, `${bridge.label} HTTP ${res.status} — trying next`)
      return null
    }
    const data = (await res.json()) as {
      extracted?: Record<string, unknown>
      data?: Record<string, unknown>
      currentUrl?: string
      url?: string
      screenshotBase64?: string
      pdfBase64?: string
      logs?: string[]
      messageAr?: string
      ok?: boolean
    }
    if (Array.isArray(data.logs)) {
      for (const l of data.logs) pushLog(logs, String(l))
    }
    return {
      ok: data.ok !== false,
      extracted: data.extracted || data.data || {},
      currentUrl: data.currentUrl || data.url || targetUrl,
      screenshotBase64: data.screenshotBase64 || null,
      pdfBase64: data.pdfBase64 || null,
      logs,
      messageAr:
        data.messageAr ||
        (bridge.label === 'mac-sync'
          ? 'اكتملت مهمة المتصفح عبر جسر الماك.'
          : 'اكتملت مهمة المتصفح عبر جسر browser-use.'),
      provider: bridge.label,
    }
  } catch (e) {
    pushLog(
      logs,
      `${bridge.label} unreachable: ${e instanceof Error ? e.message : 'error'}`
    )
    return null
  }
}

/**
 * Steel.dev: create a session, then ask their task/agent endpoint if available.
 * Falls back to session metadata when task API is unavailable.
 */
async function viaSteel(
  taskPrompt: string,
  targetUrl: string,
  logs: string[]
): Promise<BrowserTaskResult | null> {
  const apiKey = process.env.STEEL_API_KEY?.trim()
  if (!apiKey) return null
  const apiBase = (
    process.env.STEEL_API_URL || 'https://api.steel.dev'
  ).replace(/\/$/, '')
  pushLog(logs, 'Creating Steel browser session')
  try {
    const sessionRes = await fetch(`${apiBase}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'steel-api-key': apiKey,
      },
      body: JSON.stringify({
        url: targetUrl,
        timeout: 60_000,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!sessionRes.ok) {
      pushLog(logs, `Steel session HTTP ${sessionRes.status}`)
      return {
        ok: false,
        extracted: {},
        currentUrl: targetUrl,
        logs,
        messageAr: `فشل إنشاء جلسة Steel (HTTP ${sessionRes.status}). تحقق من STEEL_API_KEY.`,
        provider: 'steel',
      }
    }
    const session = (await sessionRes.json()) as {
      id?: string
      sessionId?: string
      debugUrl?: string
      viewerUrl?: string
    }
    const sessionId = session.id || session.sessionId
    pushLog(logs, `Steel session ${sessionId || 'unknown'}`)

    let extracted: Record<string, unknown> = {
      sessionId,
      debugUrl: session.debugUrl || session.viewerUrl || null,
      taskPrompt,
    }
    if (sessionId) {
      try {
        const taskRes = await fetch(
          `${apiBase}/v1/sessions/${sessionId}/task`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'steel-api-key': apiKey,
            },
            body: JSON.stringify({ task: taskPrompt, url: targetUrl }),
            signal: AbortSignal.timeout(90_000),
          }
        )
        if (taskRes.ok) {
          const taskData = (await taskRes.json()) as Record<string, unknown>
          extracted = { ...extracted, ...taskData }
          pushLog(logs, 'Steel task completed')
        } else {
          pushLog(
            logs,
            `Steel task endpoint HTTP ${taskRes.status} — session created only`
          )
        }
      } catch (e) {
        pushLog(
          logs,
          `Steel task skipped: ${e instanceof Error ? e.message : 'error'}`
        )
      }
    }

    return {
      ok: true,
      extracted,
      currentUrl: targetUrl,
      logs,
      messageAr: sessionId
        ? 'أُنشئت جلسة Steel. راجع debugUrl للمتابعة اليدوية إن لزم.'
        : 'استجابة Steel بدون معرّف جلسة.',
      provider: 'steel',
    }
  } catch (e) {
    pushLog(logs, e instanceof Error ? e.message : 'steel error')
    return {
      ok: false,
      extracted: {},
      currentUrl: targetUrl,
      logs,
      messageAr: 'تعذّر الاتصال بـ Steel. تحقق من STEEL_API_KEY والشبكة.',
      provider: 'steel',
    }
  }
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Run a browser automation task against an external site.
 * Order: browser-use URL → Mac sync → Steel. Unreachable hops fall through.
 */
export async function executeBrowserTask(
  taskPrompt: string,
  targetUrl: string
): Promise<BrowserTaskResult> {
  const logs: string[] = []
  const task = taskPrompt.trim()
  const url = targetUrl.trim()
  if (!task) {
    return {
      ok: false,
      extracted: {},
      currentUrl: null,
      logs,
      messageAr: 'يلزم وصف المهمة (taskPrompt).',
      provider: 'none',
    }
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      extracted: {},
      currentUrl: null,
      logs,
      messageAr: 'يلزم رابط هدف صالح يبدأ بـ http(s).',
      provider: 'none',
    }
  }

  pushLog(logs, `Task: ${task.slice(0, 200)}`)
  pushLog(logs, `URL: ${url}`)

  const dedicated = process.env.BROWSER_USE_URL?.trim()
  const mac = process.env.MAC_SYNC_URL?.trim()
  const lastFailures: BrowserTaskResult[] = []

  if (dedicated) {
    const result = await viaHttpBridge(
      {
        base: normalizeBase(dedicated),
        secret:
          process.env.BROWSER_USE_SECRET?.trim() ||
          process.env.MAC_SYNC_SECRET?.trim() ||
          '',
        label: 'browser-use',
      },
      task,
      url,
      logs
    )
    if (result?.ok) return result
    if (result) lastFailures.push(result)
  }

  if (mac && normalizeBase(mac) !== (dedicated ? normalizeBase(dedicated) : '')) {
    const result = await viaHttpBridge(
      {
        base: normalizeBase(mac),
        secret:
          process.env.MAC_SYNC_SECRET?.trim() ||
          process.env.BROWSER_USE_SECRET?.trim() ||
          '',
        label: 'mac-sync',
      },
      task,
      url,
      logs
    )
    if (result?.ok) return result
    if (result) lastFailures.push(result)
  }

  const steel = await viaSteel(task, url, logs)
  if (steel) return steel

  if (lastFailures.length > 0) {
    const last = lastFailures[lastFailures.length - 1]!
    return {
      ...last,
      messageAr:
        last.messageAr ||
        'فشلت أتمتة المتصفح على الجسور المتاحة. راجع السجلات أو فعّل STEEL_API_KEY.',
    }
  }

  pushLog(logs, 'No browser provider configured')
  return {
    ok: false,
    extracted: {},
    currentUrl: url,
    logs,
    messageAr:
      'أتمتة المتصفح غير مفعّلة. اضبط BROWSER_USE_URL أو MAC_SYNC_URL (جسر الماك) أو STEEL_API_KEY. المهمة تتطلب موافقة بشرية (HITL).',
    provider: 'none',
  }
}

export function isBrowserRpaConfigured() {
  return Boolean(
    process.env.BROWSER_USE_URL?.trim() ||
      process.env.MAC_SYNC_URL?.trim() ||
      process.env.STEEL_API_KEY?.trim()
  )
}
