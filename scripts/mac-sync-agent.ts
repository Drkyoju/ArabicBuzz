/**
 * Mac sync agent — receives uploads from Netlify / browser and writes to ~/ArabicBuzz/data.
 *
 *   npm run storage:sync
 *   MAC_SYNC_SECRET=... MAC_SYNC_PORT=7420 npm run storage:sync
 *
 * On Netlify set MAC_SYNC_URL to a tunnel (ngrok) pointing here, e.g.
 *   https://xxxx.ngrok-free.app
 */
import { createServer } from 'node:http'
import { config } from 'dotenv'
import { saveLocalFile, getStorageStatus, ensureVault } from '../lib/storage/local'

config({ path: '.env.local' })
config({ path: '.env' })

const PORT = Number(process.env.MAC_SYNC_PORT || 7420)
const SECRET =
  process.env.MAC_SYNC_SECRET?.trim() ||
  process.env.LOCAL_STORAGE_SYNC_SECRET?.trim() ||
  'arabic-buzz-local'

ensureVault('_shared')

function checkAuth(req: { headers: { authorization?: string; 'x-sync-secret'?: string } }) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const alt = req.headers['x-sync-secret'] || ''
  return bearer === SECRET || alt === SECRET
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Sync-Secret'
  )
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    const status = getStorageStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        agent: 'arabic-buzz-mac-sync',
        storage: status,
      })
    )
    return
  }

  if (req.method === 'POST' && url.pathname === '/sync') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks)

    try {
      const contentType = req.headers['content-type'] || ''
      let scopeId = 'shared-demo'
      let originalName = 'upload.bin'
      let mimeType = 'application/octet-stream'
      let buffer: Buffer

      if (contentType.includes('application/json')) {
        const body = JSON.parse(raw.toString('utf8')) as {
          scopeId?: string
          originalName?: string
          mimeType?: string
          contentBase64?: string
        }
        scopeId = body.scopeId || scopeId
        originalName = body.originalName || originalName
        mimeType = body.mimeType || mimeType
        if (!body.contentBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'contentBase64 required' }))
          return
        }
        buffer = Buffer.from(body.contentBase64, 'base64')
      } else {
        // naive multipart: look for filename + binary after double CRLF of last part header
        // Prefer JSON clients; FormData from Node uses JSON path via upload route.
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Send application/json with contentBase64',
          })
        )
        return
      }

      if (buffer.length > 40 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'file too large' }))
        return
      }

      const meta = saveLocalFile({
        scopeId,
        buffer,
        originalName,
        mimeType,
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          file: meta,
          messageAr: `حُفظ على الماك عبر وكيل المزامنة: ${meta.originalName}`,
        })
      )
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: e instanceof Error ? e.message : 'sync failed',
        })
      )
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, '0.0.0.0', () => {
  const status = getStorageStatus()
  console.log(`Arabic Buzz Mac sync agent on http://127.0.0.1:${PORT}`)
  console.log(`  POST /sync  (Bearer ${SECRET.slice(0, 4)}…)`)
  console.log(`  vault: ${status.root}`)
  console.log(`  tunnel tip: npx ngrok http ${PORT}`)
})
