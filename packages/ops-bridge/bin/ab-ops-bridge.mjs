#!/usr/bin/env node
/**
 * Arabic Buzz ops bridge launcher.
 *
 * Wraps stdio MCP servers with Supergateway (streamable HTTP / SSE) so Netlify
 * can reach them via MCP_*_URL / MCP_REMOTE_SERVERS.
 *
 * Usage:
 *   node packages/ops-bridge/bin/ab-ops-bridge.mjs filesystem
 *   node packages/ops-bridge/bin/ab-ops-bridge.mjs markitdown
 *   node packages/ops-bridge/bin/ab-ops-bridge.mjs github
 *   node packages/ops-bridge/bin/ab-ops-bridge.mjs list
 *
 * Env:
 *   OPS_BRIDGE_PORT=8000
 *   OPS_BRIDGE_BASE_URL=https://your-tunnel.example (printed for Netlify copy-paste)
 *   GITHUB_PERSONAL_ACCESS_TOKEN=… (github preset)
 *   FILESYSTEM_ROOT=~/ArabicBuzz/data (filesystem preset)
 *
 * Requires: npx (downloads @supercorp/supergateway on first run)
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const PORT = Number(process.env.OPS_BRIDGE_PORT || 8000)
const BASE =
  (process.env.OPS_BRIDGE_BASE_URL || `http://127.0.0.1:${PORT}`).replace(
    /\/$/,
    ''
  )

/** @typedef {{ id: string, name: string, stdio: string[], envKeys?: string[], netlifyHint: string }} Preset */

/** @type {Record<string, Preset>} */
const PRESETS = {
  filesystem: {
    id: 'filesystem',
    name: 'Filesystem MCP',
    stdio: [
      'npx',
      '-y',
      '@modelcontextprotocol/server-filesystem',
      resolve(
        process.env.FILESYSTEM_ROOT || `${homedir()}/ArabicBuzz/data`
      ),
    ],
    netlifyHint: 'MCP_FILESYSTEM_URL or MCP_REMOTE_SERVERS id=filesystem',
  },
  markitdown: {
    id: 'markitdown',
    name: 'MarkItDown MCP',
    // Prefer Mac sync agent POST /markitdown for Arabic Buzz product path.
    // This preset exposes the community MarkItDown MCP over HTTP when needed.
    stdio: ['npx', '-y', 'markitdown-mcp'],
    netlifyHint:
      'Prefer MAC_SYNC_URL + POST /markitdown. Optional: MCP_MARKITDOWN_URL',
  },
  github: {
    id: 'github',
    name: 'GitHub MCP',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-github'],
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    netlifyHint: 'MCP_GITHUB_URL or MCP_REMOTE_SERVERS id=github',
  },
  brave: {
    id: 'brave-search',
    name: 'Brave Search MCP (stdio → remote)',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-brave-search'],
    envKeys: ['BRAVE_API_KEY'],
    netlifyHint:
      'Prefer native BRAVE_API_KEY on Netlify. Optional: BRAVE_MCP_URL',
  },
  memory: {
    id: 'memory-kg',
    name: 'Memory KG MCP',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-memory'],
    netlifyHint: 'MCP_MEMORY_KG_URL',
  },
  fetch: {
    id: 'fetch',
    name: 'Fetch MCP',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-fetch'],
    netlifyHint: 'MCP_FETCH_URL or MCP_REMOTE_SERVERS id=fetch',
  },
  'sequential-thinking': {
    id: 'sequential-thinking',
    name: 'Sequential Thinking MCP',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-sequential-thinking'],
    netlifyHint: 'MCP_SEQUENTIAL_THINKING_URL',
  },
  playwright: {
    id: 'playwright',
    name: 'Playwright MCP',
    stdio: ['npx', '-y', '@playwright/mcp@latest'],
    netlifyHint:
      'Prefer MAC_SYNC_URL / browser-use. Optional: MCP_PLAYWRIGHT_URL',
  },
  time: {
    id: 'time',
    name: 'Time MCP',
    stdio: ['npx', '-y', '@modelcontextprotocol/server-time'],
    netlifyHint: 'MCP_TIME_URL',
  },
}

function printList() {
  console.log('Arabic Buzz ops-bridge presets:\n')
  for (const p of Object.values(PRESETS)) {
    console.log(`  ${p.id.padEnd(14)} ${p.name}`)
    console.log(`                 Netlify: ${p.netlifyHint}`)
    console.log(`                 URL tip: ${BASE}/mcp  (or /sse depending on gateway)`)
    console.log('')
  }
  console.log('Mac sync agent (preferred for browser-use / markitdown / vault):')
  console.log('  npm run storage:sync')
  console.log('  Netlify: MAC_SYNC_URL + MAC_SYNC_SECRET')
  console.log('  Health:  GET $MAC_SYNC_URL/health')
  console.log('')
  console.log('MCP Toolbox (Postgres, not stdio on Netlify):')
  console.log('  See docs/ops-spine.md — set MCP_TOOLBOX_URL=https://host/mcp')
}

function missingEnv(keys = []) {
  return keys.filter((k) => !process.env[k]?.trim())
}

function main() {
  const cmd = (process.argv[2] || 'list').toLowerCase()
  if (cmd === 'list' || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    printList()
    return
  }

  const preset = PRESETS[cmd]
  if (!preset) {
    console.error(`Unknown preset "${cmd}". Try: list`)
    process.exit(1)
  }

  const miss = missingEnv(preset.envKeys)
  if (miss.length) {
    console.error(`Missing env for ${preset.id}: ${miss.join(', ')}`)
    process.exit(1)
  }

  const [bin, ...args] = preset.stdio
  // Supergateway: expose stdio MCP as streamable HTTP
  // https://github.com/supercorp-ai/supergateway
  const gwArgs = [
    '-y',
    'supergateway',
    '--stdio',
    [bin, ...args].map(shellQuote).join(' '),
    '--port',
    String(PORT),
    '--outputTransport',
    'streamableHttp',
  ]

  console.log(`[ops-bridge] starting ${preset.name}`)
  console.log(`[ops-bridge] listen  : 0.0.0.0:${PORT}`)
  console.log(`[ops-bridge] Netlify : ${BASE}/mcp`)
  console.log(`[ops-bridge] hint    : ${preset.netlifyHint}`)
  console.log(`[ops-bridge] stdio   : ${bin} ${args.join(' ')}`)
  console.log('')

  const child = spawn('npx', gwArgs, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}

function shellQuote(s) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

main()
