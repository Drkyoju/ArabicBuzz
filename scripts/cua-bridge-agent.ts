/**
 * Thin HTTP bridge → local Cua Driver (`cua-driver call …`).
 *
 * Does NOT run on Netlify. Run on your desktop next to `cua-driver serve`:
 *
 *   # 1) Install: https://cua.ai/cua-driver
 *   /bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
 *   cua-driver serve
 *
 *   # 2) Bridge:
 *   CUA_BRIDGE_SECRET=… CUA_BRIDGE_PORT=7430 npm run cua:bridge
 *
 *   # 3) Tunnel (e.g. ngrok http 7430) → Netlify:
 *   CUA_BRIDGE_URL=https://xxxx.ngrok-free.app
 *   CUA_BRIDGE_SECRET=…   # or reuse MAC_SYNC_SECRET
 *
 * Endpoints: GET /health · POST /action { action, args }
 */
import { createServer, type IncomingMessage } from 'node:http'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

const PORT = Number(process.env.CUA_BRIDGE_PORT || 7430)
const SECRET =
  process.env.CUA_BRIDGE_SECRET?.trim() ||
  process.env.MAC_SYNC_SECRET?.trim() ||
  process.env.LOCAL_STORAGE_SYNC_SECRET?.trim() ||
  'arabic-buzz-local'
const CUA_BIN = process.env.CUA_DRIVER_BIN?.trim() || 'cua-driver'
const SOCKET = process.env.CUA_DRIVER_SOCKET?.trim() || ''

const ALLOWED = new Set([
  'health_report',
  'list_windows',
  'list_apps',
  'check_permissions',
  'get_window_state',
  'get_browser_state',
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

function checkAuth(req: IncomingMessage) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const alt = String(req.headers['x-cua-secret'] || '')
  return bearer === SECRET || alt === SECRET
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function json(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown
) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function runCua(
  tool: string,
  args: Record<string, unknown>
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const argv = ['call', tool]
    if (SOCKET) {
      argv.push('--socket', SOCKET)
    }
    const payload = JSON.stringify(args && Object.keys(args).length ? args : {})
    argv.push(payload)

    const child = spawn(CUA_BIN, argv, {
      env: process.env,
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        code: 124,
        stdout,
        stderr: stderr || 'timeout calling cua-driver',
      })
    }, 85_000)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        code: 127,
        stdout,
        stderr: err.message || 'spawn failed',
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function probeDriver(): Promise<{
  ok: boolean
  version?: string
  status?: string
  error?: string
}> {
  const version = await new Promise<string>((resolve) => {
    const child = spawn(CUA_BIN, ['--version'], { env: process.env })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out.trim()))
  })
  if (!version) {
    return {
      ok: false,
      error:
        'cua-driver غير موجود في PATH. ثبّته من https://cua.ai/cua-driver ثم أعد المحاولة.',
    }
  }
  const status = await new Promise<string>((resolve) => {
    const argv = SOCKET
      ? ['status', '--socket', SOCKET]
      : ['status']
    const child = spawn(CUA_BIN, argv, { env: process.env })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      out += String(d)
    })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out.trim()))
  })
  return { ok: true, version, status: status || undefined }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Cua-Secret'
  )
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (
    req.method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/health')
  ) {
    const driver = await probeDriver()
    json(res, driver.ok ? 200 : 503, {
      ok: driver.ok,
      agent: 'arabic-buzz-cua-bridge',
      driver: {
        bin: CUA_BIN,
        version: driver.version || null,
        status: driver.status || null,
      },
      messageAr: driver.ok
        ? 'جسر Cua المحلي جاهز.'
        : driver.error || 'cua-driver غير متاح.',
      error: driver.error || null,
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/action') {
    if (!checkAuth(req)) {
      json(res, 401, {
        ok: false,
        error: 'unauthorized',
        messageAr: 'سر الجسر غير صحيح (Authorization Bearer).',
      })
      return
    }
    const rawBody = await readBody(req)
    let body: {
      action?: string
      tool?: string
      args?: Record<string, unknown>
      arguments?: Record<string, unknown>
    } = {}
    try {
      body = JSON.parse(rawBody.toString('utf8') || '{}') as typeof body
    } catch {
      json(res, 400, {
        ok: false,
        messageAr: 'جسم الطلب يجب أن يكون JSON.',
      })
      return
    }
    const action = String(body.action || body.tool || '').trim()
    const args = (body.args || body.arguments || {}) as Record<string, unknown>
    if (!action || !ALLOWED.has(action)) {
      json(res, 400, {
        ok: false,
        messageAr: `إجراء غير مسموح: ${action || '(فارغ)'}`,
      })
      return
    }

    const result = await runCua(action, args)
    const ok = result.code === 0
    let parsed: unknown = null
    const text = (result.stdout || '').trim()
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { text }
      }
    }
    json(res, ok ? 200 : 502, {
      ok,
      action,
      data: parsed,
      raw: text || result.stderr,
      logs: [
        `cua-driver call ${action} → exit ${result.code}`,
        ...(result.stderr ? [result.stderr.slice(0, 500)] : []),
      ],
      messageAr: ok
        ? `اكتمل ${action} عبر cua-driver.`
        : result.code === 127
          ? 'cua-driver غير مثبت أو غير موجود في PATH.'
          : `فشل ${action}: ${(result.stderr || result.stdout || 'خطأ').slice(0, 240)}`,
      error: ok ? undefined : result.stderr || `exit ${result.code}`,
    })
    return
  }

  json(res, 404, { ok: false, error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[cua-bridge] listening on http://127.0.0.1:${PORT}  (cua-bin=${CUA_BIN})`
  )
  console.log(
    `[cua-bridge] set CUA_BRIDGE_URL via tunnel + CUA_BRIDGE_SECRET=${SECRET.slice(0, 4)}…`
  )
  console.log(
    '[cua-bridge] require: cua-driver serve (daemon) before calling /action'
  )
})
