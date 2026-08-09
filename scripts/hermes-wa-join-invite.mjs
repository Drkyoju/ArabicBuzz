#!/usr/bin/env node
/**
 * Join a WhatsApp group via invite code using the Hermes Baileys session.
 *
 * The live bridge holds the session exclusively — this script stops the gateway
 * (or waits for port 3000 free), accepts the invite, prints the @g.us JID, then
 * optionally restarts the gateway.
 *
 * Usage:
 *   node scripts/hermes-wa-join-invite.mjs EXhnU7Vlul7LIcDsYvVBAg
 *   node scripts/hermes-wa-join-invite.mjs --url 'https://chat.whatsapp.com/EXhn…'
 *   node scripts/hermes-wa-join-invite.mjs CODE --no-restart
 *
 * Env:
 *   HERMES_HOME          default ~/.hermes
 *   WHATSAPP_SESSION_DIR default $HERMES_HOME/platforms/whatsapp/session
 */

import { createRequire } from 'module'
import { spawnSync } from 'child_process'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { setTimeout as sleep } from 'timers/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
const SESSION_DIR =
  process.env.WHATSAPP_SESSION_DIR ||
  path.join(HERMES_HOME, 'platforms', 'whatsapp', 'session')
const BRIDGE_NM = path.join(
  HERMES_HOME,
  'hermes-agent',
  'scripts',
  'whatsapp-bridge',
  'node_modules',
)
const require = createRequire(path.join(BRIDGE_NM, 'package.json'))

function parseArgs(argv) {
  let code = ''
  let restart = true
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--no-restart') restart = false
    else if (a === '--url' && argv[i + 1]) {
      code = extractCode(argv[++i])
    } else if (a.startsWith('http')) {
      code = extractCode(a)
    } else if (!a.startsWith('-')) {
      code = extractCode(a)
    }
  }
  return { code, restart }
}

function extractCode(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  return s.replace(/^\//, '').split(/[?#]/)[0]
}

function hermesBin() {
  const home = os.homedir()
  return (
    process.env.HERMES_BIN ||
    path.join(home, '.local', 'bin', 'hermes')
  )
}

function portInUse(port = 3000) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })
  return r.status === 0 && Boolean(r.stdout?.trim())
}

async function waitPortFree(port = 3000, ms = 45000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (!portInUse(port)) return
    await sleep(500)
  }
  throw new Error(`Port ${port} still in use after ${ms}ms — stop Hermes WA bridge first`)
}

async function waitHealth(port = 3000, ms = 90000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) {
        const j = await res.json()
        if (j.status === 'connected') return j
      }
    } catch {
      /* retry */
    }
    await sleep(1000)
  }
  throw new Error(`Bridge /health not connected within ${ms}ms`)
}

async function acceptInvite(code) {
  const baileys = await import(
    path.join(BRIDGE_NM, '@whiskeysockets/baileys/lib/index.js')
  )
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
  } = baileys
  const { Boom } = require('@hapi/boom')
  const pino = (await import(path.join(BRIDGE_NM, 'pino/pino.js'))).default

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  return new Promise((resolve, reject) => {
    let settled = false
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      syncFullHistory: false,
      markOnlineOnConnect: false,
    })

    const fail = (err) => {
      if (settled) return
      settled = true
      try {
        sock.end(undefined)
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    const ok = (jid) => {
      if (settled) return
      settled = true
      try {
        sock.end(undefined)
      } catch {
        /* ignore */
      }
      resolve(jid)
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update
      if (connection === 'open') {
        try {
          let info = null
          try {
            info = await sock.groupGetInviteInfo(code)
          } catch {
            /* optional preflight */
          }

          let jid
          try {
            jid = await sock.groupAcceptInvite(code)
          } catch (err) {
            const msg = String(err?.message || err || '')
            const status = err?.output?.statusCode
            const data = err?.data
            // 409 conflict = already a participant (common after phone join / re-accept)
            if (
              /conflict|already/i.test(msg) ||
              status === 409 ||
              data === 409 ||
              data === 403
            ) {
              jid = info?.id || info?.jid
              if (!jid) {
                const groups = await sock.groupFetchAllParticipating()
                const match = Object.values(groups || {}).find(
                  (g) =>
                    (info?.id && g.id === info.id) ||
                    (info?.subject && g.subject === info.subject),
                )
                jid = match?.id
              }
              if (!jid) {
                throw new Error(
                  `Invite accept conflict (${msg || data || status}); could not resolve group JID. Join from the phone UI once, then run allowlist-sync --from-logs.`,
                )
              }
            } else {
              throw err
            }
          }
          if (!jid) throw new Error('groupAcceptInvite returned empty JID')
          let subject = info?.subject || ''
          try {
            const meta = await sock.groupMetadata(jid)
            subject = meta?.subject || subject
          } catch {
            /* optional */
          }
          ok({ jid, subject, alreadyMember: Boolean(info) })
        } catch (err) {
          fail(err)
        }
      } else if (connection === 'close') {
        const status =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : undefined
        if (!settled) {
          fail(
            new Error(
              `WA closed before join (status=${status ?? 'unknown'}; loggedOut=${status === DisconnectReason.loggedOut})`,
            ),
          )
        }
      }
    })

    setTimeout(() => fail(new Error('Timed out waiting for WA connection')), 60000)
  })
}

async function main() {
  const { code, restart } = parseArgs(process.argv.slice(2))
  if (!code || code.length < 8) {
    console.error('Usage: hermes-wa-join-invite.mjs <inviteCode|url> [--no-restart]')
    process.exit(2)
  }

  console.log(`Invite code: ${code}`)
  console.log(`Session: ${SESSION_DIR}`)

  if (portInUse(3000)) {
    console.log('Stopping hermes gateway so Baileys session is free…')
    const stop = spawnSync(hermesBin(), ['gateway', 'stop'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(hermesBin())}:${process.env.PATH || ''}` },
    })
    if (stop.status !== 0) {
      console.error(stop.stderr || stop.stdout || 'gateway stop failed')
    }
    await waitPortFree(3000)
  }

  let result
  try {
    result = await acceptInvite(code)
  } catch (err) {
    console.error('Join failed:', err?.message || err)
    if (restart) {
      console.log('Restarting gateway anyway…')
      spawnSync(hermesBin(), ['gateway', 'restart'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${path.dirname(hermesBin())}:${process.env.PATH || ''}` },
      })
    }
    process.exit(1)
  }

  console.log(JSON.stringify({ ok: true, jid: result.jid, subject: result.subject }, null, 2))

  // Merge into allowlist (local scripts; no Discord)
  const sync = path.join(__dirname, 'hermes-wa-allowlist-sync.sh')
  if (existsSync(sync)) {
    console.log('Updating allowlist…')
    spawnSync('bash', [sync, '--add', result.jid, '--no-restart'], {
      encoding: 'utf8',
      stdio: 'inherit',
    })
  }

  if (restart) {
    console.log('Restarting hermes gateway…')
    spawnSync(hermesBin(), ['gateway', 'restart'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(hermesBin())}:${process.env.PATH || ''}` },
    })
    try {
      await waitHealth(3000)
      console.log('Bridge connected again.')
    } catch (err) {
      console.warn(String(err.message || err))
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
