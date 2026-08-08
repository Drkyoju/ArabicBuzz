/**
 * High-fidelity Office conversion via LibreOffice `soffice` when available.
 * CranL production image installs LibreOffice by default (INSTALL_LIBREOFFICE=1).
 * Pass INSTALL_LIBREOFFICE=0 for a thin image; host / Mac bridge still work.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
  return Boolean(await resolveLibreOfficeBinary())
}

/** Arabic status for integrations / health (no secrets). */
export async function libreOfficeStatusAr(): Promise<string> {
  if (await libreOfficeAvailable()) {
    return 'مجاني · مفعّل (LibreOffice soffice على الخادم)'
  }
  if (process.env.AB_LIBREOFFICE_IMAGE === '1') {
    return 'متوقع في الصورة لكن soffice غير موجود — راجع بناء Docker'
  }
  return 'غير مثبت — الصورة الرقيقة أو INSTALL_LIBREOFFICE=0 · اربط Google أو أعد البناء بـ INSTALL_LIBREOFFICE=1'
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

/**
 * Convert via LibreOffice headless. Best for Word↔PDF when soffice is installed.
 * Not a substitute for Drive OCR on broken ToUnicode PDFs.
 */
export async function convertViaLibreOffice(opts: {
  buffer: Buffer
  filename: string
  inputFormat: string
  outputFormat: string
  timeoutMs?: number
}): Promise<{ buffer: Buffer; filename: string; mimeType: string; engine: 'libreoffice' }> {
  const bin = await resolveLibreOfficeBinary()
  if (!bin) {
    throw new Error('LibreOffice (soffice) غير متوفر في بيئة التشغيل.')
  }
  const from = opts.inputFormat.toLowerCase()
  const to = opts.outputFormat.toLowerCase()
  if (!canConvertViaLibreOffice(from, to)) {
    throw new Error(`LibreOffice لا يدعم ${from} → ${to} في هذا المسار.`)
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-lo-'))
  const inName = `input.${from}`
  const inPath = path.join(tmpRoot, inName)
  try {
    await fs.writeFile(inPath, opts.buffer)
    const filter =
      to === 'pdf'
        ? 'pdf:writer_pdf_Export'
        : to === 'docx'
          ? 'docx:Office Open XML Text'
          : to === 'xlsx'
            ? 'xlsx:Calc MS Excel 2007 XML'
            : to === 'pptx'
              ? 'pptx:Impress MS PowerPoint 2007 XML'
              : to === 'csv'
                ? 'csv:Text - txt - csv (StarCalc)'
                : to

    const { code, stderr } = await runSoffice(
      bin,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--convert-to',
        filter.includes(':') ? filter.split(':')[0]! : to,
        '--outdir',
        tmpRoot,
        inPath,
      ],
      opts.timeoutMs ?? 90_000
    )
    if (code !== 0) {
      throw new Error(
        `فشل LibreOffice (${code}): ${stderr.slice(0, 240) || 'بدون تفاصيل'}`
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
