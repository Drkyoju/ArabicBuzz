/**
 * High-fidelity Office conversion via LibreOffice.
 *
 * Prefer remote always-on sidecar (CONVERT_SERVICE_URL / LIBREOFFICE_URL) so CranL
 * stays thin (INSTALL_LIBREOFFICE=0). Fall back to local soffice, then callers may
 * try mac-hop. Prefer Google Drive for Arabic layout / broken ToUnicode PDFs.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateNetworkAccess } from '@/lib/security/airgap'

const SOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  process.env.SOFFICE_PATH,
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter(Boolean) as string[]

let cachedSoffice: string | null | undefined

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function which(cmd: string): Promise<string | null> {
  if (cmd.includes('/')) {
    return (await pathExists(cmd)) ? cmd : null
  }
  return new Promise((resolve) => {
    const child = spawn('which', [cmd], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => {
      const hit = out.trim().split('\n')[0]
      resolve(code === 0 && hit ? hit : null)
    })
    child.on('error', () => resolve(null))
  })
}

/** Remote LibreOffice sidecar — CONVERT_SERVICE_URL preferred, LIBREOFFICE_URL alias. */
export function libreOfficeRemoteUrl(): string | null {
  const raw =
    process.env.CONVERT_SERVICE_URL?.trim() ||
    process.env.LIBREOFFICE_URL?.trim() ||
    ''
  return raw.replace(/\/$/, '') || null
}

export function libreOfficeRemoteSecret(): string | null {
  return (
    process.env.CONVERT_SECRET?.trim() ||
    process.env.LIBREOFFICE_SECRET?.trim() ||
    null
  )
}

/** Resolve soffice binary once per process. */
export async function resolveLibreOfficeBinary(): Promise<string | null> {
  if (cachedSoffice !== undefined) return cachedSoffice
  for (const c of SOFFICE_CANDIDATES) {
    const hit = await which(c)
    if (hit) {
      cachedSoffice = hit
      return hit
    }
  }
  cachedSoffice = null
  return null
}

export async function libreOfficeAvailable(): Promise<boolean> {
  if (libreOfficeRemoteUrl()) return true
  return Boolean(await resolveLibreOfficeBinary())
}

/** Arabic status for integrations / health (no secrets). */
export async function libreOfficeStatusAr(): Promise<string> {
  if (libreOfficeRemoteUrl()) {
    return 'مجاني · خدمة تحويل بعيدة مضبوطة (CONVERT_SERVICE_URL / LIBREOFFICE_URL)'
  }
  if (await resolveLibreOfficeBinary()) {
    return 'مجاني · مفعّل (LibreOffice soffice على الخادم)'
  }
  if (process.env.AB_LIBREOFFICE_IMAGE === '1') {
    return 'متوقع في الصورة لكن soffice غير موجود — راجع بناء Docker أو عيّن CONVERT_SERVICE_URL'
  }
  return 'غير مثبت — شغّل sidecar (docker-compose.convert.yml) وعيّن CONVERT_SERVICE_URL · أو اربط Google'
}

const LO_PAIRS = new Set([
  'docx:pdf',
  'doc:pdf',
  'odt:pdf',
  'rtf:pdf',
  'pdf:docx',
  'xlsx:pdf',
  'xls:pdf',
  'ods:pdf',
  'pptx:pdf',
  'ppt:pdf',
  'odp:pdf',
  'docx:odt',
  'odt:docx',
  'xlsx:ods',
  'ods:xlsx',
  'pptx:odp',
  'odp:pptx',
  'csv:xlsx',
  'xlsx:csv',
  'txt:pdf',
  'txt:docx',
  'html:pdf',
  'html:docx',
])

export function canConvertViaLibreOffice(
  fromFormat: string,
  toFormat: string
): boolean {
  const from = fromFormat.toLowerCase()
  const to = toFormat.toLowerCase()
  if (from === to) return false
  return LO_PAIRS.has(`${from}:${to}`)
}

function runSoffice(
  bin: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, HOME: process.env.HOME || os.tmpdir() },
    })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stderr: stderr || 'timeout' })
    }, timeoutMs)
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, stderr: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
  })
}

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  csv: 'text/csv',
  txt: 'text/plain; charset=utf-8',
}

async function convertViaRemoteLibreOffice(opts: {
  buffer: Buffer
  filename: string
  inputFormat: string
  outputFormat: string
  timeoutMs?: number
}): Promise<{
  buffer: Buffer
  filename: string
  mimeType: string
  engine: 'libreoffice-remote'
}> {
  const base = libreOfficeRemoteUrl()
  if (!base) {
    throw new Error('CONVERT_SERVICE_URL / LIBREOFFICE_URL غير مضبوط')
  }
  const url = `${base}/convert`
  validateNetworkAccess(url)
  const secret = libreOfficeRemoteSecret()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (secret) {
    headers.Authorization = `Bearer ${secret}`
    headers.apikey = secret
    headers['x-convert-secret'] = secret
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contentBase64: opts.buffer.toString('base64'),
      filename: opts.filename,
      inputFormat: opts.inputFormat.toLowerCase(),
      outputFormat: opts.outputFormat.toLowerCase(),
      timeoutMs: opts.timeoutMs ?? 90_000,
    }),
  })
  const raw = await res.text().catch(() => '')
  let parsed: {
    ok?: boolean
    contentBase64?: string
    filename?: string
    mimeType?: string
    messageAr?: string
    error?: string
  } = {}
  try {
    parsed = raw ? JSON.parse(raw) : {}
  } catch {
    parsed = {}
  }
  if (!res.ok || !parsed.ok || !parsed.contentBase64) {
    throw new Error(
      parsed.messageAr ||
        parsed.error ||
        `خدمة التحويل البعيدة HTTP ${res.status}: ${raw.slice(0, 160)}`
    )
  }
  const to = opts.outputFormat.toLowerCase()
  return {
    buffer: Buffer.from(parsed.contentBase64, 'base64'),
    filename: parsed.filename || `${path.basename(opts.filename, path.extname(opts.filename))}.${to}`,
    mimeType: parsed.mimeType || MIME[to] || 'application/octet-stream',
    engine: 'libreoffice-remote',
  }
}

/**
 * Convert via remote sidecar first, then local soffice.
 * Not a substitute for Drive OCR on broken ToUnicode PDFs.
 */
export async function convertViaLibreOffice(opts: {
  buffer: Buffer
  filename: string
  inputFormat: string
  outputFormat: string
  timeoutMs?: number
}): Promise<{
  buffer: Buffer
  filename: string
  mimeType: string
  engine: 'libreoffice' | 'libreoffice-remote'
}> {
  const from = opts.inputFormat.toLowerCase()
  const to = opts.outputFormat.toLowerCase()
  if (!canConvertViaLibreOffice(from, to)) {
    throw new Error(`LibreOffice لا يدعم ${from} → ${to} في هذا المسار.`)
  }

  let remoteFail: string | null = null
  if (libreOfficeRemoteUrl()) {
    try {
      return await convertViaRemoteLibreOffice(opts)
    } catch (e) {
      remoteFail = e instanceof Error ? e.message : 'فشل التحويل البعيد'
    }
  }

  const bin = await resolveLibreOfficeBinary()
  if (!bin) {
    throw new Error(
      remoteFail
        ? `LibreOffice المحلي غير متوفر بعد فشل الخدمة البعيدة: ${remoteFail}`
        : 'LibreOffice (soffice) غير متوفر — عيّن CONVERT_SERVICE_URL أو ثبّت soffice.'
    )
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-lo-'))
  const inName = `input.${from}`
  const inPath = path.join(tmpRoot, inName)
  try {
    await fs.writeFile(inPath, opts.buffer)
    const { code, stderr } = await runSoffice(
      bin,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--convert-to',
        to,
        '--outdir',
        tmpRoot,
        inPath,
      ],
      opts.timeoutMs ?? 90_000
    )
    if (code !== 0) {
      throw new Error(
        `فشل LibreOffice (${code}): ${stderr.slice(0, 240) || 'بدون تفاصيل'}${
          remoteFail ? ` · بعيد: ${remoteFail}` : ''
        }`
      )
    }
    const files = await fs.readdir(tmpRoot)
    const outFile =
      files.find((f) => f.toLowerCase().endsWith(`.${to}`)) ||
      files.find((f) => f !== inName)
    if (!outFile) {
      throw new Error('LibreOffice لم يُنتج ملفاً ناتجاً.')
    }
    const outBuf = await fs.readFile(path.join(tmpRoot, outFile))
    if (!outBuf.length) {
      throw new Error('ملف LibreOffice الناتج فارغ.')
    }
    const base = path.basename(opts.filename, path.extname(opts.filename))
    return {
      buffer: outBuf,
      filename: `${base}.${to}`,
      mimeType: MIME[to] || 'application/octet-stream',
      engine: 'libreoffice',
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}
