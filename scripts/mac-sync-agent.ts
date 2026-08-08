/**
 * Mac sync agent — vault + company brain on this machine.
 *
 *   npm run storage:sync
 *   MAC_SYNC_SECRET=... MAC_SYNC_PORT=7420 npm run storage:sync
 *
 * On Netlify:
 *   MAC_SYNC_URL=https://xxxx.ngrok-free.app
 *   MAC_SYNC_SECRET=...
 *   BRAIN_PRIMARY=mac
 *   NEXT_PUBLIC_MAC_UPLOAD_URL=https://xxxx.ngrok-free.app
 *
 * Large files (1GB+): browser POSTs raw body to /upload (not via Netlify).
 */
import { createServer, type IncomingMessage } from 'node:http'
import { config } from 'dotenv'
import {
  saveLocalFile,
  getStorageStatus,
  ensureVault,
  readLocalFile,
  listLocalFiles,
  deleteLocalFile,
  renameLocalFile,
  replaceLocalFile,
} from '../lib/storage/local'
import {
  ensureMacBrain,
  getMacBrainStatus,
  ingestMacBrainDocument,
  searchMacBrain,
} from '../lib/storage/mac-brain'

config({ path: '.env.local' })
config({ path: '.env' })

const PORT = Number(process.env.MAC_SYNC_PORT || 7420)
const SECRET =
  process.env.MAC_SYNC_SECRET?.trim() ||
  process.env.LOCAL_STORAGE_SYNC_SECRET?.trim() ||
  'arabic-buzz-local'
const MAX_BYTES = Number(
  process.env.MAC_MAX_UPLOAD_BYTES || 8 * 1024 * 1024 * 1024
)

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'local'

ensureVault('_shared')
ensureMacBrain()

function checkAuth(req: IncomingMessage) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const alt = String(req.headers['x-sync-secret'] || '')
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

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Sync-Secret, X-Scope-Id, X-Original-Name, X-Mime-Type, X-Title-Ar'
  )
  res.setHeader('Access-Control-Expose-Headers', 'X-File-Id')
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
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const { execFileSync } = await import('node:child_process')
    const here = fileURLToPath(new URL('.', import.meta.url))
    const root = join(here, '..')
    const which = (cmd: string): string | null => {
      try {
        return (
          execFileSync('/bin/sh', ['-c', `command -v ${cmd}`], {
            encoding: 'utf8',
          }).trim() || null
        )
      } catch {
        return null
      }
    }
    const tessCandidates = [
      process.env.TESSERACT_CMD?.trim(),
      '/usr/local/bin/tesseract',
      '/opt/homebrew/bin/tesseract',
      which('tesseract'),
    ].filter(Boolean) as string[]
    const tesseractPath = tessCandidates.find((p) => existsSync(p)) || null
    const sofficeCandidates = [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      which('soffice'),
      which('libreoffice'),
    ].filter(Boolean) as string[]
    const sofficePath = sofficeCandidates.find((p) => existsSync(p)) || null
    const venvPy = join(root, 'scripts/pdf-tools-venv/bin/python')
    json(res, 200, {
      ok: true,
      agent: 'arabic-buzz-mac-sync',
      storage: getStorageStatus(),
      brain: getMacBrainStatus(),
      maxUploadBytes: MAX_BYTES,
      tools: {
        tesseract: Boolean(tesseractPath),
        tesseractPath,
        libreoffice: Boolean(sofficePath),
        sofficePath,
        pdfToolsVenv: existsSync(venvPy),
        endpoints: [
          '/pdf-page-ocr',
          '/pdf-docx-convert',
          '/pdf-replace',
          '/markitdown',
        ],
      },
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/brain/status') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    json(res, 200, getMacBrainStatus())
    return
  }

  if (req.method === 'GET' && url.pathname === '/files') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
    try {
      json(res, 200, { ok: true, files: listLocalFiles(scopeId) })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'list failed',
      })
    }
    return
  }

  // GET /files/:id — download binary
  const fileGet = url.pathname.match(/^\/files\/([^/]+)$/)
  if (req.method === 'GET' && fileGet) {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const id = decodeURIComponent(fileGet[1]!)
    const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
    try {
      const hit = readLocalFile(scopeId, id)
      if (!hit) {
        json(res, 404, { error: 'الملف غير موجود' })
        return
      }
      res.writeHead(200, {
        'Content-Type': hit.meta.mimeType || 'application/octet-stream',
        'Content-Length': hit.buffer.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(hit.meta.originalName)}`,
        'X-File-Id': hit.meta.id,
        'X-Original-Name': encodeURIComponent(hit.meta.originalName),
      })
      res.end(hit.buffer)
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'read failed',
      })
    }
    return
  }

  // DELETE /files/:id
  if (req.method === 'DELETE' && fileGet) {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const id = decodeURIComponent(fileGet[1]!)
    const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
    const result = deleteLocalFile(scopeId, id)
    if (!result.ok) {
      json(res, 404, { error: result.error })
      return
    }
    json(res, 200, {
      ok: true,
      deleted: true,
      file: result.meta,
      messageAr: `حُذف «${result.meta.originalName}» من خزنة الماك`,
    })
    return
  }

  // PATCH /files/:id — rename { originalName }
  if (req.method === 'PATCH' && fileGet) {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const id = decodeURIComponent(fileGet[1]!)
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8')) as {
        scopeId?: string
        originalName?: string
      }
      const scopeId = body.scopeId || url.searchParams.get('scopeId') || 'shared-demo'
      const result = renameLocalFile(
        scopeId,
        id,
        String(body.originalName || '')
      )
      if (!result.ok) {
        json(res, 400, { error: result.error })
        return
      }
      json(res, 200, {
        ok: true,
        file: result.meta,
        messageAr: `أُعيدت تسمية الملف إلى «${result.meta.originalName}»`,
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'rename failed',
      })
    }
    return
  }

  // PUT /files/:id — replace content (raw body)
  if (req.method === 'PUT' && fileGet) {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const id = decodeURIComponent(fileGet[1]!)
    const scopeId = String(
      req.headers['x-scope-id'] || url.searchParams.get('scopeId') || 'shared-demo'
    )
    try {
      const buffer = await readBody(req)
      if (buffer.length === 0) {
        json(res, 400, { error: 'جسم فارغ' })
        return
      }
      if (buffer.length > MAX_BYTES) {
        json(res, 413, { error: 'file too large' })
        return
      }
      const originalName = req.headers['x-original-name']
        ? decodeURIComponent(String(req.headers['x-original-name']))
        : undefined
      const mimeType = req.headers['x-mime-type']
        ? String(req.headers['x-mime-type'])
        : undefined
      const result = replaceLocalFile(scopeId, id, buffer, {
        originalName,
        mimeType,
      })
      if (!result.ok) {
        json(res, 404, { error: result.error })
        return
      }
      json(res, 200, {
        ok: true,
        file: result.meta,
        messageAr: `استُبدل محتوى «${result.meta.originalName}» على الماك`,
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'replace failed',
      })
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/brain/search') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8')) as {
        queryAr?: string
        scopeId?: string
        limit?: number
        source?: 'drive' | 'all'
      }
      const documents = searchMacBrain({
        queryAr: String(body.queryAr || ''),
        scopeId: String(body.scopeId || 'shared-demo'),
        limit: body.limit,
        source: body.source === 'all' ? 'all' : 'drive',
      })
      json(res, 200, { ok: true, count: documents.length, documents })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'search failed',
      })
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/brain/ingest') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const contentType = req.headers['content-type'] || ''
      let scopeId = 'shared-demo'
      let titleAr = 'مستند الشركة'
      let content = ''
      let sourceFileId: string | undefined
      let sourcePath: string | undefined

      if (contentType.includes('application/json')) {
        const body = JSON.parse(raw.toString('utf8')) as {
          scopeId?: string
          titleAr?: string
          content?: string
          text?: string
          localFileId?: string
          sourceFileId?: string
          sourcePath?: string
        }
        scopeId = body.scopeId || scopeId
        titleAr = body.titleAr || titleAr
        content = String(body.content || body.text || '')
        sourceFileId = body.sourceFileId || body.localFileId
        sourcePath = body.sourcePath
        if (!content && body.localFileId) {
          const hit = readLocalFile(scopeId, body.localFileId)
          if (!hit) {
            json(res, 404, { error: 'الملف غير موجود على الماك' })
            return
          }
          const { extractDocumentText } = await import('../lib/rag/extract')
          const extracted = await extractDocumentText({
            buffer: hit.buffer,
            filename: hit.meta.originalName,
            mimeType: hit.meta.mimeType,
            enableOcr: true,
          })
          content = extracted.text
          titleAr = body.titleAr || hit.meta.originalName
          sourceFileId = hit.meta.id
          sourcePath = hit.meta.relativePath
        }
      } else {
        json(res, 400, {
          error: 'أرسل JSON: content أو localFileId',
        })
        return
      }

      if (!content.trim()) {
        json(res, 400, { error: 'لا يوجد نص للاستيعاب' })
        return
      }

      const result = ingestMacBrainDocument({
        scopeId,
        titleAr,
        content,
        sourceFileId,
        sourcePath,
      })
      if (!result.ok) {
        json(res, 500, { error: result.error })
        return
      }
      json(res, 200, {
        ok: true,
        chunks: result.chunks,
        messageAr: `أُضيف ${result.chunks} مقطع إلى عقل الماك`,
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'ingest failed',
      })
    }
    return
  }

  /** Raw binary upload — preferred for multi‑hundred‑MB / 1GB+. */
  if (req.method === 'POST' && url.pathname === '/upload') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const scopeId = String(req.headers['x-scope-id'] || 'shared-demo')
      const originalName = decodeURIComponent(
        String(req.headers['x-original-name'] || 'upload.bin')
      )
      const mimeType = String(
        req.headers['x-mime-type'] ||
          req.headers['content-type'] ||
          'application/octet-stream'
      )
      const buffer = await readBody(req)
      if (buffer.length === 0) {
        json(res, 400, { error: 'جسم فارغ' })
        return
      }
      if (buffer.length > MAX_BYTES) {
        json(res, 413, {
          error: `الملف أكبر من الحد (${MAX_BYTES} بايت). ارفع MAC_MAX_UPLOAD_BYTES.`,
        })
        return
      }
      const meta = saveLocalFile({
        scopeId,
        buffer,
        originalName,
        mimeType: mimeType.split(';')[0]!.trim(),
      })
      res.setHeader('X-File-Id', meta.id)
      json(res, 200, {
        ok: true,
        file: meta,
        messageAr: `حُفظ على الماك: ${meta.originalName} (${Math.round(meta.size / (1024 * 1024))} MB)`,
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'upload failed',
      })
    }
    return
  }

  /** Legacy JSON base64 sync (small/medium files via Netlify hop). */
  if (req.method === 'POST' && url.pathname === '/sync') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8')) as {
        scopeId?: string
        originalName?: string
        mimeType?: string
        contentBase64?: string
      }
      if (!body.contentBase64) {
        json(res, 400, { error: 'contentBase64 required' })
        return
      }
      const buffer = Buffer.from(body.contentBase64, 'base64')
      if (buffer.length > MAX_BYTES) {
        json(res, 413, { error: 'file too large' })
        return
      }
      const meta = saveLocalFile({
        scopeId: body.scopeId || 'shared-demo',
        buffer,
        originalName: body.originalName || 'upload.bin',
        mimeType: body.mimeType || 'application/octet-stream',
      })
      json(res, 200, {
        ok: true,
        file: meta,
        messageAr: `حُفظ على الماك عبر وكيل المزامنة: ${meta.originalName}`,
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'sync failed',
      })
    }
    return
  }

  // Arabic PDF find/replace via PyMuPDF insert_htmlbox (HarfBuzz)
  if (req.method === 'POST' && url.pathname === '/pdf-replace') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        filename?: string
        contentBase64?: string
        replacements?: Array<{ find?: string; replace?: string }>
      }
      const b64 = String(body.contentBase64 || '')
      if (!b64) {
        json(res, 400, { error: 'contentBase64 required' })
        return
      }
      const reps = Array.isArray(body.replacements)
        ? body.replacements
            .map((r) => ({
              find: String(r?.find || ''),
              replace: String(r?.replace ?? ''),
            }))
            .filter((r) => r.find.trim())
        : []
      if (!reps.length) {
        json(res, 400, { error: 'replacements required' })
        return
      }

      const { writeFileSync, unlinkSync, mkdtempSync, existsSync } =
        await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const { spawn } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')

      const dir = mkdtempSync(join(tmpdir(), 'ab-pdf-'))
      const inPath = join(dir, 'in.pdf')
      const outPath = join(dir, 'out.pdf')
      writeFileSync(inPath, Buffer.from(b64, 'base64'))

      // Prefer project venv next to this repo when agent runs from ArabicBuzz
      const here = fileURLToPath(new URL('.', import.meta.url))
      const root = join(here, '..')
      const script = join(root, 'scripts/pdf-arabic-replace.py')
      const pyCandidates = [
        process.env.PDF_REPLACE_PYTHON?.trim(),
        join(root, 'scripts/pdf-tools-venv/bin/python'),
        join(root, 'tmp/pdf-venv/bin/python'),
        'python3',
      ].filter(Boolean) as string[]

      const payload = JSON.stringify({
        inputPath: inPath,
        outputPath: outPath,
        replacements: reps,
      })

      const tryPy = (cmd: string) =>
        new Promise<{
          ok: boolean
          out: string
          err: string
        }>((resolve) => {
          if (cmd.includes('/') && !existsSync(cmd)) {
            resolve({ ok: false, out: '', err: `missing ${cmd}` })
            return
          }
          if (!existsSync(script)) {
            resolve({ ok: false, out: '', err: 'pdf-arabic-replace.py missing' })
            return
          }
          const child = spawn(cmd, [script, '--stdin-json'], { timeout: 90_000 })
          let out = ''
          let err = ''
          child.stdout?.on('data', (d) => {
            out += String(d)
          })
          child.stderr?.on('data', (d) => {
            err += String(d)
          })
          child.stdin?.write(payload)
          child.stdin?.end()
          child.on('close', (code) => {
            resolve({ ok: code === 0, out, err })
          })
          child.on('error', (e) => {
            resolve({ ok: false, out: '', err: e.message })
          })
        })

      let result: { ok: boolean; out: string; err: string } | null = null
      for (const py of pyCandidates) {
        result = await tryPy(py)
        if (result.out.trim().startsWith('{')) break
      }

      let parsed: {
        ok?: boolean
        error?: string
        messageAr?: string
        totalReplacements?: number
        details?: unknown
        font?: string
      } = {}
      try {
        parsed = JSON.parse((result?.out || '').trim() || '{}')
      } catch {
        parsed = {}
      }

      const { readFileSync } = await import('node:fs')
      if (parsed.ok && existsSync(outPath)) {
        const outBuf = readFileSync(outPath)
        try {
          unlinkSync(inPath)
          unlinkSync(outPath)
        } catch {
          /* ignore */
        }
        json(res, 200, {
          ok: true,
          contentBase64: outBuf.toString('base64'),
          totalReplacements: parsed.totalReplacements || 0,
          details: parsed.details || [],
          font: parsed.font,
          messageAr:
            parsed.messageAr ||
            'استبدال PDF عبر PyMuPDF على الماك.',
        })
        return
      }

      try {
        unlinkSync(inPath)
      } catch {
        /* ignore */
      }
      json(res, 200, {
        ok: false,
        messageAr:
          parsed.messageAr ||
          'PyMuPDF غير متاح على الماك. ثبّت: python3 -m venv scripts/pdf-tools-venv && scripts/pdf-tools-venv/bin/pip install pymupdf',
        error: parsed.error || result?.err?.slice(0, 400) || 'pdf-replace failed',
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'pdf-replace failed',
      })
    }
    return
  }

  // Local PDF↔DOCX (LibreOffice / pdf2docx / visual pages) — quality-aware
  if (req.method === 'POST' && url.pathname === '/pdf-docx-convert') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        filename?: string
        contentBase64?: string
        toFormat?: string
        mode?: string
      }
      const b64 = String(body.contentBase64 || '')
      if (!b64) {
        json(res, 400, { error: 'contentBase64 required' })
        return
      }
      const toFormat = String(body.toFormat || 'docx').toLowerCase()
      if (toFormat !== 'docx' && toFormat !== 'pdf') {
        json(res, 400, { error: 'toFormat must be docx or pdf' })
        return
      }
      const {
        writeFileSync,
        readFileSync,
        unlinkSync,
        mkdtempSync,
        existsSync,
      } = await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const { spawn } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')

      const here = fileURLToPath(new URL('.', import.meta.url))
      const root = join(here, '..')
      const script = join(root, 'scripts/pdf-docx-convert.py')
      const pyCandidates = [
        process.env.PDF_CONVERT_PYTHON?.trim(),
        join(root, 'tmp/pdf-venv/bin/python'),
        join(root, 'scripts/pdf-tools-venv/bin/python'),
        'python3',
      ].filter(Boolean) as string[]

      const dir = mkdtempSync(join(tmpdir(), 'ab-conv-'))
      const inName = String(
        body.filename || `in.${toFormat === 'docx' ? 'pdf' : 'docx'}`
      )
      const inExt = inName.includes('.')
        ? inName.slice(inName.lastIndexOf('.'))
        : '.bin'
      const inPath = join(dir, `in${inExt}`)
      const outPath = join(dir, `out.${toFormat}`)
      writeFileSync(inPath, Buffer.from(b64, 'base64'))

      const mode = String(body.mode || 'auto')
      let lastErr = ''
      let ok = false
      let log = ''
      for (const py of pyCandidates) {
        if (py.includes('/') && !existsSync(py)) continue
        if (!existsSync(script)) {
          lastErr = 'pdf-docx-convert.py missing'
          break
        }
        const result = await new Promise<{
          code: number
          out: string
          err: string
        }>((resolve) => {
          const child = spawn(
            py,
            [script, inPath, '-o', outPath, '--mode', mode],
            { timeout: 300_000 }
          )
          let out = ''
          let err = ''
          child.stdout?.on('data', (d) => {
            out += String(d)
          })
          child.stderr?.on('data', (d) => {
            err += String(d)
          })
          child.on('close', (code) =>
            resolve({ code: code ?? 1, out, err })
          )
          child.on('error', (e) =>
            resolve({ code: 1, out: '', err: String(e) })
          )
        })
        if (result.code === 0 && existsSync(outPath)) {
          ok = true
          log = (result.out + '\n' + result.err).trim()
          break
        }
        lastErr = result.err || result.out || `exit ${result.code}`
      }

      if (!ok || !existsSync(outPath)) {
        try {
          unlinkSync(inPath)
        } catch {
          /* ignore */
        }
        json(res, 500, {
          error: lastErr || 'convert failed',
          hintAr:
            'ثبّت LibreOffice أو pdf2docx في tmp/pdf-venv، أو استخدم Google Drive من الموقع.',
        })
        return
      }

      const outBuf = readFileSync(outPath)
      try {
        unlinkSync(inPath)
        unlinkSync(outPath)
      } catch {
        /* ignore */
      }
      json(res, 200, {
        ok: true,
        filename:
          String(body.filename || 'converted').replace(/\.[^.]+$/, '') +
          `.${toFormat}`,
        contentBase64: outBuf.toString('base64'),
        size: outBuf.length,
        log: log.slice(0, 800),
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'convert failed',
      })
    }
    return
  }

  // Page OCR — PyMuPDF render + Tesseract ara+eng
  if (req.method === 'POST' && url.pathname === '/pdf-page-ocr') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        filename?: string
        contentBase64?: string
        page?: number
        lang?: string
        allPages?: boolean
      }
      const b64 = String(body.contentBase64 || '')
      if (!b64) {
        json(res, 400, { error: 'contentBase64 required' })
        return
      }
      const {
        writeFileSync,
        unlinkSync,
        mkdtempSync,
        existsSync,
      } = await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const { spawn } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')

      const here = fileURLToPath(new URL('.', import.meta.url))
      const root = join(here, '..')
      const script = join(root, 'scripts/pdf-page-ocr.py')
      const venvPy = join(root, 'scripts/pdf-tools-venv/bin/python')
      const py = existsSync(venvPy) ? venvPy : 'python3'

      const dir = mkdtempSync(join(tmpdir(), 'ab-page-ocr-'))
      const fname = (body.filename || 'doc.pdf').replace(
        /[^\w.\u0600-\u06FF-]+/g,
        '_'
      )
      const inPath = join(dir, fname)
      writeFileSync(inPath, Buffer.from(b64, 'base64'))

      const page = Math.max(1, Number(body.page || 1))
      const lang = String(body.lang || process.env.TESSERACT_OCR_LANG || 'ara+eng')
      const args = [script, inPath, '--page', String(page), '--lang', lang]
      if (body.allPages) args.push('--all-pages')

      const result: { ok: boolean; out: string; err: string } = await new Promise(
        (resolve) => {
          const child = spawn(py, args, { timeout: 180_000 })
          let out = ''
          let err = ''
          child.stdout?.on('data', (d) => {
            out += String(d)
          })
          child.stderr?.on('data', (d) => {
            err += String(d)
          })
          child.on('close', (code) => {
            resolve({ ok: code === 0, out, err })
          })
          child.on('error', (e) => {
            resolve({ ok: false, out: '', err: e.message })
          })
        }
      )

      try {
        unlinkSync(inPath)
      } catch {
        /* ignore */
      }

      let parsed: {
        ok?: boolean
        text?: string
        page?: number
        provider?: string
        error?: string
      } = {}
      try {
        parsed = JSON.parse(result.out || '{}') as typeof parsed
      } catch {
        parsed = { ok: false, error: result.err || result.out || 'bad json' }
      }

      if (parsed.ok && parsed.text != null) {
        json(res, 200, {
          ok: true,
          text: parsed.text,
          page: parsed.page || page,
          provider: parsed.provider || 'tesseract-mac',
        })
        return
      }

      json(res, 200, {
        ok: false,
        error:
          parsed.error ||
          result.err?.slice(0, 400) ||
          'OCR فشل. ثبّت: brew install tesseract tesseract-lang && pip install pytesseract pillow pymupdf',
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'pdf-page-ocr failed',
      })
    }
    return
  }

  // MarkItDown — convert PDF/Office → markdown for decision deep-read
  if (req.method === 'POST' && url.pathname === '/markitdown') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        filename?: string
        contentBase64?: string
        mimeType?: string
      }
      const b64 = String(body.contentBase64 || '')
      if (!b64) {
        json(res, 400, { error: 'contentBase64 required' })
        return
      }
      const { writeFileSync, unlinkSync, mkdtempSync } =
        await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')
      const { spawn } = await import('node:child_process')
      const dir = mkdtempSync(join(tmpdir(), 'ab-md-'))
      const fname = (body.filename || 'doc.pdf').replace(/[^\w.\u0600-\u06FF-]+/g, '_')
      const inPath = join(dir, fname)
      writeFileSync(inPath, Buffer.from(b64, 'base64'))

      const tryCmd = async (
        cmd: string,
        args: string[]
      ): Promise<{ ok: boolean; out: string; err: string }> =>
        new Promise((resolve) => {
          const child = spawn(cmd, args, { timeout: 90_000 })
          let out = ''
          let err = ''
          child.stdout?.on('data', (d) => {
            out += String(d)
          })
          child.stderr?.on('data', (d) => {
            err += String(d)
          })
          child.on('close', (code) => {
            resolve({ ok: code === 0, out, err })
          })
          child.on('error', (e) => {
            resolve({ ok: false, out: '', err: e.message })
          })
        })

      // Prefer `markitdown` CLI (pip install markitdown)
      let result = await tryCmd('markitdown', [inPath])
      if (!result.ok) {
        result = await tryCmd('python3', ['-m', 'markitdown', inPath])
      }
      try {
        unlinkSync(inPath)
      } catch {
        /* ignore */
      }
      if (!result.ok || !result.out.trim()) {
        json(res, 200, {
          ok: false,
          markdown: '',
          messageAr:
            'MarkItDown غير متاح على الماك. ثبّت: pip install "markitdown[all]"',
          error: result.err.slice(0, 400),
        })
        return
      }
      json(res, 200, {
        ok: true,
        markdown: result.out.slice(0, 200_000),
        messageAr: 'حُوّل المستند عبر MarkItDown على الماك.',
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'markitdown failed',
      })
    }
    return
  }

  // Browser-use / Playwright RPA bridge — Netlify calls POST {task,url} here
  if (req.method === 'POST' && url.pathname === '/task') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        task?: string
        url?: string
        maxSteps?: number
        engine?: 'playwright' | 'browser-use' | 'auto'
      }
      const task = String(body.task || '').trim()
      const target = String(body.url || '').trim()
      const logs = [
        `[mac] received task: ${task.slice(0, 120)}`,
        `[mac] url: ${target}`,
      ]
      const { existsSync } = await import('node:fs')
      const { spawn } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join } = await import('node:path')
      const here = dirname(fileURLToPath(import.meta.url))

      const runSpawn = (
        cmd: string,
        args: string[]
      ): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
        new Promise((resolve) => {
          const child = spawn(cmd, args, { timeout: 120_000 })
          let stdout = ''
          let stderr = ''
          child.stdout?.on('data', (d) => {
            stdout += String(d)
          })
          child.stderr?.on('data', (d) => {
            stderr += String(d)
          })
          child.on('close', (code) => {
            resolve({ ok: code === 0, stdout, stderr })
          })
          child.on('error', (e) => {
            resolve({ ok: false, stdout: '', stderr: e.message })
          })
        })

      const prefer =
        body.engine ||
        (process.env.BROWSER_ENGINE as 'playwright' | 'browser-use' | 'auto') ||
        'auto'

      const pwScript =
        process.env.PLAYWRIGHT_SCRIPT ||
        join(here, 'playwright-task.mjs')
      const buScript =
        process.env.BROWSER_USE_SCRIPT ||
        join(here, 'browser-use-task.py')

      const tryPlaywright = prefer !== 'browser-use' && existsSync(pwScript)
      const tryBrowserUse = prefer !== 'playwright' && existsSync(buScript)

      // Prefer browser-use in auto mode; Playwright is the fallback.
      const engines: Array<'browser-use' | 'playwright'> =
        prefer === 'playwright'
          ? ['playwright']
          : prefer === 'browser-use'
            ? ['browser-use']
            : ['browser-use', 'playwright']

      for (const engine of engines) {
        if (engine === 'browser-use' && task && target && tryBrowserUse) {
          logs.push('[mac] engine=browser-use')
          const result = await runSpawn('python3', [buScript, target, task])
          logs.push(result.stderr.slice(0, 500))
          let extracted: Record<string, unknown> = {}
          try {
            extracted = JSON.parse(result.stdout) as Record<string, unknown>
          } catch {
            extracted = { raw: result.stdout.slice(0, 4000) }
          }
          const ok =
            result.ok && (extracted as { ok?: boolean }).ok !== false
          json(res, 200, {
            ok,
            extracted:
              (extracted.extracted as Record<string, unknown>) || extracted,
            currentUrl:
              (extracted.currentUrl as string) || target,
            logs: [
              ...logs,
              ...((extracted.logs as string[]) || []),
            ],
            messageAr:
              (extracted.messageAr as string) ||
              (ok
                ? 'اكتملت مهمة browser-use على الماك — راجع النتيجة (HITL).'
                : 'فشل سكربت browser-use المحلي.'),
            provider: 'browser-use',
          })
          return
        }

        if (engine === 'playwright' && task && target && tryPlaywright) {
          logs.push('[mac] engine=playwright')
          const result = await runSpawn('node', [pwScript, target, task])
          logs.push(result.stderr.slice(0, 500))
          let parsed: Record<string, unknown> = {}
          try {
            parsed = JSON.parse(result.stdout) as Record<string, unknown>
          } catch {
            parsed = { raw: result.stdout.slice(0, 4000) }
          }
          json(res, 200, {
            ok: result.ok && parsed.ok !== false,
            extracted: (parsed.extracted as Record<string, unknown>) || parsed,
            currentUrl: (parsed.currentUrl as string) || target,
            screenshotBase64: parsed.screenshotBase64 || null,
            logs: [...logs, ...((parsed.logs as string[]) || [])],
            messageAr:
              (parsed.messageAr as string) ||
              (result.ok
                ? 'اكتملت مهمة Playwright على الماك — راجع اللقطة (HITL).'
                : 'فشل Playwright المحلي.'),
            provider: 'playwright',
          })
          return
        }
      }

      json(res, 200, {
        ok: false,
        extracted: {},
        currentUrl: target,
        logs,
        messageAr:
          'جسر الماك جاهز لكن لا سكربت. ضع scripts/browser-use-task.py أو scripts/playwright-task.mjs.',
      })
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'task failed',
      })
    }
    return
  }

  // GET /telegram/history-status — MTProto / local Bot API readiness (no chat spam)
  if (req.method === 'GET' && url.pathname === '/telegram/history-status') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { homedir } = await import('node:os')
    const apiId = Boolean(process.env.TELEGRAM_API_ID?.trim())
    const apiHash = Boolean(process.env.TELEGRAM_API_HASH?.trim())
    const session = Boolean(
      (
        process.env.TELEGRAM_SESSION_STRING ||
        process.env.TELEGRAM_SESSION ||
        ''
      ).trim()
    )
    const sessionFile = existsSync(
      join(homedir(), '.arabicbuzz-telegram.session.txt')
    )
    const localBot = Boolean(
      (
        process.env.TELEGRAM_BOT_API_URL ||
        process.env.TELEGRAM_BOT_API_ROOT ||
        ''
      ).trim()
    )
    json(res, 200, {
      ok: true,
      localBotApiConfigured: localBot,
      mtprotoEnvPresent: apiId && apiHash && (session || sessionFile),
      credentialsReady: apiId && apiHash && (session || sessionFile),
      setupAr:
        'مرة واحدة: TELEGRAM_API_ID/HASH من my.telegram.org ثم npm run telegram:mtproto-login — بلا رسالة للمجموعة.',
      limitationAr:
        'البوت لا يقرأ التاريخ القديم؛ مسح المجموعة يحتاج جلسة مستخدم Telethon.',
    })
    return
  }

  // POST /telegram/scan-history — Telethon user client deep scan (free)
  if (req.method === 'POST' && url.pathname === '/telegram/scan-history') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        chatId?: string
        limit?: number
        offsetId?: number
        download?: boolean
        muallimOnly?: boolean
        nameFilter?: string
      }
      const { spawn } = await import('node:child_process')
      const { existsSync, readFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      const { fileURLToPath } = await import('node:url')
      const here = fileURLToPath(new URL('.', import.meta.url))
      const root = join(here, '..')
      const script = join(root, 'scripts/telegram-mtproto-history.py')
      const pyCandidates = [
        join(root, 'scripts/pdf-tools-venv/bin/python'),
        '/tmp/tg-telethon-venv/bin/python',
        'python3',
      ]
      const env = {
        ...process.env,
        TELEGRAM_SCAN_CHAT_ID: String(body.chatId || '-1003855925966'),
        TELEGRAM_SCAN_LIMIT: String(body.limit ?? 200),
        TELEGRAM_SCAN_OFFSET_ID: String(body.offsetId || 0),
        TELEGRAM_SCAN_DOWNLOAD: body.download === false ? '0' : '1',
        TELEGRAM_SCAN_MUALLIM_ONLY: body.muallimOnly === false ? '0' : '1',
        TELEGRAM_SCAN_NAME_FILTER: body.nameFilter || '',
        TELEGRAM_SCAN_OUT: join(homedir(), 'ArabicBuzz/recovered/tg-history'),
      }
      let lastErr = 'no python'
      for (const py of pyCandidates) {
        if (py !== 'python3' && !existsSync(py)) continue
        try {
          const out: Buffer[] = []
          const err: Buffer[] = []
          const code: number = await new Promise((resolve) => {
            const child = spawn(py, [script], {
              env,
              timeout: 110_000,
            })
            child.stdout.on('data', (c) => out.push(c))
            child.stderr.on('data', (c) => err.push(c))
            child.on('close', (c) => resolve(c ?? 1))
            child.on('error', () => resolve(1))
          })
          const text = Buffer.concat(out).toString('utf8').trim()
          const line = text.split('\n').filter(Boolean).pop() || '{}'
          const parsed = JSON.parse(line) as Record<string, unknown>
          if (
            parsed &&
            (parsed.ok === true || parsed.credentialsReady === false)
          ) {
            const hits = Array.isArray(parsed.muallimHits)
              ? (parsed.muallimHits as Array<Record<string, unknown>>)
              : []
            const payloads: Array<Record<string, unknown>> = []
            for (const h of hits.slice(0, 3)) {
              const p = h.path ? String(h.path) : ''
              if (!p || !existsSync(p)) continue
              const buf = readFileSync(p)
              if (buf.byteLength > 80 * 1024 * 1024) continue
              payloads.push({
                fileName: h.fileName || h.name,
                mimeType: h.mimeType || 'application/pdf',
                messageId: h.messageId,
                contentBase64: buf.toString('base64'),
                sizeBytes: buf.byteLength,
              })
            }
            parsed.payloads = payloads
            json(res, 200, parsed)
            return
          }
          lastErr =
            String(parsed?.errorAr || Buffer.concat(err).toString().slice(0, 200)) +
            ` (exit ${code})`
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
        }
      }
      json(res, 503, {
        ok: false,
        credentialsReady: false,
        errorAr: lastErr,
        setupAr:
          'ثبّت telethon على الماك ونفّذ npm run telegram:mtproto-login مرة واحدة.',
      })
    } catch (e) {
      json(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'scan-history failed',
      })
    }
    return
  }

  // POST /telegram/fetch-file — large TG download via local Bot API (free path)
  if (req.method === 'POST' && url.pathname === '/telegram/fetch-file') {
    if (!checkAuth(req)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw.toString('utf8') || '{}') as {
        fileId?: string
        fileName?: string
        declaredSizeBytes?: number
        chatId?: string
        messageId?: string | number
      }
      const fileId = String(body.fileId || '').trim()
      if (!fileId) {
        json(res, 400, { error: 'fileId required', ok: false })
        return
      }
      const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
      if (!token) {
        json(res, 503, {
          error: 'TELEGRAM_BOT_TOKEN missing on Mac',
          ok: false,
        })
        return
      }
      const {
        downloadTelegramFileViaBotApiRoots,
        DEFAULT_LOCAL_BOT_API,
      } = await import('../lib/telegram/bot-api-download')
      const localRoot = (
        process.env.TELEGRAM_BOT_API_URL ||
        process.env.TELEGRAM_BOT_API_ROOT ||
        DEFAULT_LOCAL_BOT_API
      )
        .trim()
        .replace(/\/$/, '')
      const hit = await downloadTelegramFileViaBotApiRoots({
        token,
        fileId,
        preferLocal: true,
        roots: [localRoot, 'https://api.telegram.org'],
      })
      if (!hit) {
        json(res, 404, {
          ok: false,
          error:
            'تعذّر التنزيل عبر Bot API المحلي — شغّل deploy/telegram-bot-api على الماك (منفذ 8081).',
        })
        return
      }
      json(res, 200, {
        ok: true,
        contentBase64: hit.buffer.toString('base64'),
        filePath: hit.filePath,
        source: hit.source,
        remoteSize: hit.remoteSize ?? hit.buffer.byteLength,
        fileName: body.fileName || hit.filePath,
      })
    } catch (e) {
      json(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'fetch-file failed',
      })
    }
    return
  }

  json(res, 404, { error: 'not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  const status = getStorageStatus()
  console.log(`Arabic Buzz Mac sync agent on http://127.0.0.1:${PORT}`)
  console.log(`  GET  /health`)
  console.log(`  POST /upload  (raw body, up to ${MAX_BYTES} bytes)`)
  console.log(`  GET|PUT|PATCH|DELETE /files/:id  (shared Mac drive)`)
  console.log(`  POST /sync    (JSON base64)`)
  console.log(`  POST /brain/ingest | /brain/search`)
  console.log(`  POST /task       (Playwright / browser-use RPA)`)
  console.log(`  POST /pdf-replace (Arabic PDF find/replace via PyMuPDF)`)
  console.log(`  POST /pdf-docx-convert (PDF↔DOCX local quality path)`)
  console.log(`  POST /pdf-page-ocr (PyMuPDF + Tesseract ara+eng)`)
  console.log(`  POST /markitdown (PDF/Office → Markdown)`)
  console.log(`  POST /telegram/fetch-file (large TG via local Bot API)`)
  console.log(`  GET  /telegram/history-status`)
  console.log(`  POST /telegram/scan-history (MTProto user deep archive)`)
  console.log(`  vault: ${status.root}`)
  console.log(`  secret: Bearer ${SECRET.slice(0, 4)}…`)
  console.log(`  tunnel tip: npx ngrok http ${PORT}`)
})
