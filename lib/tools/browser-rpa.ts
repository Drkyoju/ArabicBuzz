/**
 * Browser RPA bridge — Netlify-safe remote automation.
 *
 * browser-use (Python) and Playwright cannot run inside Netlify functions.
 * This module talks to a remote runner:
 *  1) BROWSER_USE_URL — self-hosted / Mac bridge (browser-use or Playwright)
 *  2) STEEL_API_KEY — Steel.dev cloud browser sessions
 *
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
  provider?: 'browser-use' | 'steel' | 'none'
}

function pushLog(logs: string[], line: string) {
  logs.push(`[${new Date().toISOString()}] ${line}`)
}

async function viaBrowserUseBridge(
  taskPrompt: string,
  targetUrl: string,
  logs: string[]
): Promise<BrowserTaskResult | null> {
  const base = (process.env.BROWSER_USE_URL || '').replace(/\/$/, '')
  if (!base) return null
  const secret = process.env.BROWSER_USE_SECRET?.trim() || ''
  pushLog(logs, `Calling browser-use bridge ${base}`)
  try {
    const res = await fetch(`${base}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        task: taskPrompt,
        url: targetUrl,
        maxSteps: Number(process.env.BROWSER_USE_MAX_STEPS || 25),
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      pushLog(logs, `bridge HTTP ${res.status}`)
      return {
        ok: false,
        extracted: {},
        currentUrl: targetUrl,
        logs,
        messageAr: `فشل جسر المتصفح (HTTP ${res.status})`,
        provider: 'browser-use',
      }
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
      messageAr: data.messageAr || 'اكتملت مهمة المتصفح عبر الجسر المحلي.',
      provider: 'browser-use',
    }
  } catch (e) {
    pushLog(logs, e instanceof Error ? e.message : 'bridge error')
    return {
      ok: false,
      extracted: {},
      currentUrl: targetUrl,
      logs,
      messageAr: 'تعذّر الاتصال بجسر browser-use.',
      provider: 'browser-use',
    }
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
        messageAr: `فشل إنشاء جلسة Steel (HTTP ${sessionRes.status})`,
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

    // Optional agent/task endpoint (varies by Steel plan)
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
      messageAr: 'تعذّر الاتصال بـ Steel.',
      provider: 'steel',
    }
  }
}

/**
 * Run a browser automation task against an external site.
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

  const bridge = await viaBrowserUseBridge(task, url, logs)
  if (bridge) return bridge

  const steel = await viaSteel(task, url, logs)
  if (steel) return steel

  pushLog(logs, 'No browser provider configured')
  return {
    ok: false,
    extracted: {},
    currentUrl: url,
    logs,
    messageAr:
      'أتمتة المتصفح غير مفعّلة. اضبط BROWSER_USE_URL (جسر محلي لـ browser-use) أو STEEL_API_KEY.',
    provider: 'none',
  }
}

export function isBrowserRpaConfigured() {
  return Boolean(
    process.env.BROWSER_USE_URL?.trim() || process.env.STEEL_API_KEY?.trim()
  )
}
