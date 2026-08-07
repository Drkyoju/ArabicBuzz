#!/usr/bin/env node
/**
 * Probe ops endpoints used by Arabic Buzz Netlify → private bridges.
 *
 * Usage:
 *   MAC_SYNC_URL=… node packages/ops-bridge/bin/healthcheck.mjs
 *   node packages/ops-bridge/bin/healthcheck.mjs https://bridge.example/health
 */
const targets = []

if (process.argv[2]) targets.push(process.argv[2])
if (process.env.MAC_SYNC_URL?.trim()) {
  targets.push(
    `${process.env.MAC_SYNC_URL.replace(/\/$/, '')}/health`
  )
}
if (process.env.BROWSER_USE_URL?.trim()) {
  targets.push(
    `${process.env.BROWSER_USE_URL.replace(/\/$/, '')}/health`
  )
}
if (process.env.CUA_BRIDGE_URL?.trim()) {
  targets.push(`${process.env.CUA_BRIDGE_URL.replace(/\/$/, '')}/health`)
}
if (process.env.MCP_TOOLBOX_URL?.trim()) {
  // Toolbox often exposes /mcp; try root/health if present
  const base = process.env.MCP_TOOLBOX_URL.replace(/\/mcp\/?$/, '').replace(
    /\/$/,
    ''
  )
  targets.push(`${base}/health`)
  targets.push(process.env.MCP_TOOLBOX_URL.trim())
}

const unique = [...new Set(targets)]
if (!unique.length) {
  console.error(
    'No targets. Pass a URL or set MAC_SYNC_URL / BROWSER_USE_URL / CUA_BRIDGE_URL / MCP_TOOLBOX_URL.'
  )
  process.exit(2)
}

let failed = 0
for (const url of unique) {
  process.stdout.write(`→ ${url} ... `)
  try {
    const secret =
      process.env.CUA_BRIDGE_SECRET?.trim() ||
      process.env.MAC_SYNC_SECRET?.trim() ||
      ''
    const res = await fetch(url, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(10_000),
    })
    console.log(`${res.status} ${res.ok ? 'OK' : 'FAIL'}`)
    if (!res.ok) failed += 1
  } catch (e) {
    console.log(`ERR ${e instanceof Error ? e.message : e}`)
    failed += 1
  }
}

process.exit(failed ? 1 : 0)
