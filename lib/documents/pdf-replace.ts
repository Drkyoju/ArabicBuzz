/**
 * High-quality Arabic PDF find/replace.
 *
 * Engine: scripts/pdf-arabic-replace.py
 *  1) Prefer embedded Arabic TTF from the PDF (e.g. Sakkal Majalla) + arabic-reshaper
 *     presentation forms + TextWriter — closest visual match to the original.
 *  2) Fallback: Page.insert_htmlbox (HarfBuzz) with Noto Naskh / SF Arabic.
 * Never use pdf-lib / insert_textbox character tricks for Arabic (disconnected glyphs).
 *
 * Run order:
 *  1) Local Python (PDF_REPLACE_PYTHON / scripts/pdf-tools-venv / python3)
 *  2) Mac sync agent POST /pdf-replace when MAC_SYNC_URL is set
 *
 * Optional paid conversion (pdf↔docx) remains CloudConvert — see cloudconvert.ts.
 * That path is for format conversion, not glyph-accurate in-place Arabic replace.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getMacSyncConfig, macSyncConfigured } from '@/lib/storage/mac-sync-client'

export type PdfTextReplacement = {
  find: string
  replace: string
}

export type PdfReplaceResult = {
  buffer: Buffer
  engine:
    | 'pymupdf-embedded-font'
    | 'pymupdf-htmlbox'
    | 'mac-pymupdf-htmlbox'
    | 'mac-pymupdf-embedded-font'
  totalReplacements: number
  details: Array<{ find: string; replace: string; count: number }>
  messageAr: string
  font?: string
}

function projectRoot(): string {
  return process.cwd()
}

function candidatePythons(): string[] {
  const root = projectRoot()
  const env = process.env.PDF_REPLACE_PYTHON?.trim()
  return [
    ...(env ? [env] : []),
    join(root, 'scripts/pdf-tools-venv/bin/python'),
    join(root, 'tmp/pdf-venv/bin/python'),
    'python3',
    'python',
  ]
}

function scriptPath(): string {
  return join(projectRoot(), 'scripts/pdf-arabic-replace.py')
}

function runProcess(
  cmd: string,
  args: string[],
  input?: string,
  timeoutMs = 90_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      timeout: timeoutMs,
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    if (input) {
      child.stdin?.write(input)
      child.stdin?.end()
    }
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (e) => {
      resolve({ code: 1, stdout: '', stderr: e.message })
    })
  })
}

async function replaceViaLocalPython(opts: {
  buffer: Buffer
  replacements: PdfTextReplacement[]
  fontPath?: string
}): Promise<PdfReplaceResult> {
  const script = scriptPath()
  if (!existsSync(script)) {
    throw new Error('scripts/pdf-arabic-replace.py غير موجود في المشروع.')
  }

  const dir = mkdtempSync(join(tmpdir(), 'ab-pdf-'))
  const inPath = join(dir, 'in.pdf')
  const outPath = join(dir, 'out.pdf')
  writeFileSync(inPath, opts.buffer)

  const payload = JSON.stringify({
    inputPath: inPath,
    outputPath: outPath,
    replacements: opts.replacements,
    fontPath: opts.fontPath || undefined,
  })

  let lastErr = ''
  for (const py of candidatePythons()) {
    if (py.includes('/') && !existsSync(py)) continue
    const r = await runProcess(py, [script, '--stdin-json'], payload)
    if (r.stdout.trim()) {
      try {
        const parsed = JSON.parse(r.stdout.trim()) as {
          ok?: boolean
          error?: string
          engine?: string
          totalReplacements?: number
          details?: Array<{ find: string; replace: string; count: number }>
          messageAr?: string
          font?: string
        }
        if (parsed.ok && existsSync(outPath)) {
          const buffer = readFileSync(outPath)
          cleanupDir(dir, [inPath, outPath])
          const eng =
            parsed.engine === 'pymupdf-embedded-font'
              ? 'pymupdf-embedded-font'
              : 'pymupdf-htmlbox'
          return {
            buffer,
            engine: eng,
            totalReplacements: parsed.totalReplacements || 0,
            details: parsed.details || [],
            messageAr:
              parsed.messageAr ||
              'تم استبدال النص العربي في PDF بمحرّك PyMuPDF.',
            font: parsed.font,
          }
        }
        lastErr = parsed.error || parsed.messageAr || r.stderr || r.stdout
      } catch {
        lastErr = r.stderr || r.stdout || 'فشل تحليل ناتج سكربت PDF'
      }
    } else {
      lastErr = r.stderr || `تعذّر تشغيل ${py}`
    }
  }

  cleanupDir(dir, [inPath, outPath])
  throw new Error(
    lastErr ||
      'محرّك PDF العربي غير متاح محلياً. ثبّت: python3 -m venv scripts/pdf-tools-venv && scripts/pdf-tools-venv/bin/pip install pymupdf'
  )
}

function cleanupDir(dir: string, files: string[]) {
  for (const f of files) {
    try {
      unlinkSync(f)
    } catch {
      /* ignore */
    }
  }
  try {
    unlinkSync(dir)
  } catch {
    /* ignore — dir may not be empty */
  }
}

async function replaceViaMacSync(opts: {
  buffer: Buffer
  filename: string
  replacements: PdfTextReplacement[]
}): Promise<PdfReplaceResult> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) throw new Error('MAC_SYNC_URL غير مضبوط')

  const res = await fetch(`${baseUrl}/pdf-replace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      filename: opts.filename,
      contentBase64: opts.buffer.toString('base64'),
      replacements: opts.replacements,
    }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    contentBase64?: string
    totalReplacements?: number
    details?: Array<{ find: string; replace: string; count: number }>
    font?: string
  }
  if (!res.ok || !data.ok || !data.contentBase64) {
    throw new Error(
      data.messageAr ||
        data.error ||
        `وكيل الماك /pdf-replace فشل (HTTP ${res.status})`
    )
  }
  const eng =
    data.font && String(data.font).startsWith('embedded:')
      ? 'mac-pymupdf-embedded-font'
      : 'mac-pymupdf-htmlbox'
  return {
    buffer: Buffer.from(data.contentBase64, 'base64'),
    engine: eng,
    totalReplacements: data.totalReplacements || 0,
    details: data.details || [],
    messageAr:
      data.messageAr ||
      'تم استبدال النص العربي عبر جسر الماك (PyMuPDF).',
    font: data.font,
  }
}

/**
 * Replace Arabic (or any) text in a PDF with layout-aware HarfBuzz shaping.
 */
export async function replacePdfText(opts: {
  buffer: Buffer | Uint8Array
  filename?: string
  replacements: PdfTextReplacement[]
  fontPath?: string
}): Promise<PdfReplaceResult> {
  const reps = (opts.replacements || [])
    .map((r) => ({
      find: String(r.find || '').trim(),
      replace: String(r.replace ?? ''),
    }))
    .filter((r) => r.find.length > 0)
  if (!reps.length) {
    throw new Error('مرّر replacements: [{ find, replace }, …]')
  }

  const buffer = Buffer.isBuffer(opts.buffer)
    ? opts.buffer
    : Buffer.from(opts.buffer)

  // Prefer local Python on the same machine (dev / Mac agent host).
  try {
    return await replaceViaLocalPython({
      buffer,
      replacements: reps,
      fontPath: opts.fontPath,
    })
  } catch (localErr) {
    if (macSyncConfigured()) {
      try {
        return await replaceViaMacSync({
          buffer,
          filename: opts.filename || 'document.pdf',
          replacements: reps,
        })
      } catch (macErr) {
        const a =
          localErr instanceof Error ? localErr.message : String(localErr)
        const b = macErr instanceof Error ? macErr.message : String(macErr)
        throw new Error(
          `فشل استبدال PDF العربي.\nمحلي: ${a}\nماك: ${b}\n` +
            'ثبّت pymupdf على الماك (scripts/pdf-tools-venv) وشغّل npm run storage:sync، أو أضف PDF_REPLACE_PYTHON.'
        )
      }
    }
    throw localErr
  }
}

export function pdfReplaceEngineHintAr(): string {
  return (
    'تعديل نص عربي داخل PDF: استخدم pdf_replace_text. ' +
    'يفضّل إعادة استخدام الخط المضمّن من الملف (مثل Sakkal Majalla) ثم HarfBuzz/Noto كاحتياطي. ' +
    'لا تستخدم pdf_stamp أو إعادة بناء النص لاستبدال أسماء — يفصل الحروف. ' +
    'على CranL يلزم جسر الماك (MAC_SYNC_URL) مع pymupdf + arabic-reshaper + python-bidi. ' +
    'CloudConvert اختياري للتحويل بين الصيغ فقط (CLOUDCONVERT_API_KEY).'
  )
}
