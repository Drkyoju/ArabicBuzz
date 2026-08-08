/**
 * Safe pdf-parse loader — package root `index.js` runs a test-file open when
 * `module.parent` is missing (common under tsx/ESM). Load lib via createRequire.
 */
import { createRequire } from 'node:module'

export type PdfParseResult = {
  text?: string
  numpages?: number
  info?: Record<string, unknown>
}

type PdfParseFn = (data: Buffer) => Promise<PdfParseResult>

let cached: PdfParseFn | null = null

export function getPdfParse(): PdfParseFn {
  if (cached) return cached
  const require = createRequire(import.meta.url)
  const mod = require('pdf-parse/lib/pdf-parse.js') as
    | PdfParseFn
    | { default?: PdfParseFn }
  const fn =
    typeof mod === 'function'
      ? mod
      : typeof (mod as { default?: PdfParseFn }).default === 'function'
        ? (mod as { default: PdfParseFn }).default
        : null
  if (!fn) {
    throw new Error('تعذّر تحميل pdf-parse')
  }
  cached = fn
  return fn
}

export async function parsePdfBuffer(
  buffer: Buffer
): Promise<PdfParseResult> {
  return getPdfParse()(buffer)
}
