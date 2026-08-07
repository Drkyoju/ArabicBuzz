/**
 * In-place text patch for OOXML (DOCX / PPTX) via JSZip.
 * Preserves packaging, styles, images, and most layout — unlike full rebuild.
 *
 * Handles Word run-splitting: logical text is joined across <w:t> / <a:t>,
 * then replacements are written back into the first matched run.
 */
import JSZip from 'jszip'

export type TextReplacement = {
  find: string
  replace: string
  /** Default true — replace all occurrences */
  all?: boolean
}

export type OfficePatchResult = {
  buffer: Buffer
  format: 'docx' | 'pptx'
  totalReplacements: number
  partsTouched: string[]
  details: Array<{ part: string; count: number }>
}

type TextNode = {
  /** Absolute start in logical string */
  start: number
  end: number
  /** Full match in XML including tags, e.g. <w:t …>text</w:t> */
  fullMatch: string
  /** Text content only */
  text: string
  tagOpen: string
  tagClose: string
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function collectTextNodes(xml: string, kind: 'w' | 'a'): TextNode[] {
  const re =
    kind === 'w'
      ? /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g
      : /(<a:t\b[^>]*>)([\s\S]*?)(<\/a:t>)/g
  const nodes: TextNode[] = []
  let logical = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const text = unescapeXmlText(m[2])
    nodes.push({
      start: logical,
      end: logical + text.length,
      fullMatch: m[0],
      text,
      tagOpen: m[1],
      tagClose: m[3],
    })
    logical += text.length
  }
  return nodes
}

function applyReplacementsToXml(
  xml: string,
  kind: 'w' | 'a',
  replacements: TextReplacement[]
): { xml: string; count: number } {
  if (!replacements.length) return { xml, count: 0 }

  let nodes = collectTextNodes(xml, kind)
  if (nodes.length === 0) return { xml, count: 0 }

  let logical = nodes.map((n) => n.text).join('')
  let total = 0
  const ops: Array<{ start: number; end: number; replace: string }> = []

  for (const r of replacements) {
    const find = String(r.find ?? '')
    if (!find) continue
    const replace = String(r.replace ?? '')
    const all = r.all !== false
    let from = 0
    while (from <= logical.length) {
      const idx = logical.indexOf(find, from)
      if (idx < 0) break
      ops.push({ start: idx, end: idx + find.length, replace })
      total++
      from = idx + (all ? Math.max(find.length, 1) : logical.length)
      if (!all) break
    }
  }

  if (ops.length === 0) return { xml, count: 0 }

  // Apply from the end so indices stay valid
  ops.sort((a, b) => b.start - a.start)

  // Rebuild logical text + map each op onto nodes
  for (const op of ops) {
    // Recompute nodes/logical after each mutation for safety on overlapping edits
    nodes = collectTextNodes(xml, kind)
    logical = nodes.map((n) => n.text).join('')
    if (op.start >= logical.length) continue

    const firstIdx = nodes.findIndex((n) => op.start < n.end && op.end > n.start)
    if (firstIdx < 0) continue

    let remainingStart = op.start
    let remainingEnd = op.end
    let wroteReplace = false

    for (let i = firstIdx; i < nodes.length && remainingStart < remainingEnd; i++) {
      const n = nodes[i]
      const overlapStart = Math.max(remainingStart, n.start)
      const overlapEnd = Math.min(remainingEnd, n.end)
      if (overlapStart >= overlapEnd) continue

      const localStart = overlapStart - n.start
      const localEnd = overlapEnd - n.start
      let newText: string
      if (!wroteReplace) {
        newText =
          n.text.slice(0, localStart) + op.replace + n.text.slice(localEnd)
        wroteReplace = true
      } else {
        newText = n.text.slice(0, localStart) + n.text.slice(localEnd)
      }

      // Preserve xml:space when leading/trailing whitespace
      let open = n.tagOpen
      if (/\s/.test(newText) && !/xml:space=/.test(open)) {
        open = open.replace(/>$/, ' xml:space="preserve">')
      }
      const newFull = `${open}${escapeXmlText(newText)}${n.tagClose}`
      // Replace only the first occurrence of this exact fullMatch from this node
      const pos = xml.indexOf(n.fullMatch)
      if (pos >= 0) {
        xml = xml.slice(0, pos) + newFull + xml.slice(pos + n.fullMatch.length)
      }
      remainingStart = overlapEnd
    }
  }

  return { xml, count: total }
}

async function listEditableParts(
  zip: JSZip,
  format: 'docx' | 'pptx'
): Promise<string[]> {
  const names = Object.keys(zip.files)
  if (format === 'docx') {
    return names.filter(
      (n) =>
        !zip.files[n].dir &&
        (n === 'word/document.xml' ||
          /^word\/header\d*\.xml$/i.test(n) ||
          /^word\/footer\d*\.xml$/i.test(n) ||
          n === 'word/footnotes.xml' ||
          n === 'word/endnotes.xml')
    )
  }
  return names.filter(
    (n) =>
      !zip.files[n].dir &&
      (/^ppt\/slides\/slide\d+\.xml$/i.test(n) ||
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n) ||
        /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(n))
  )
}

export async function patchOfficeOpenXml(opts: {
  buffer: Buffer | Uint8Array
  format: 'docx' | 'pptx'
  replacements: TextReplacement[]
}): Promise<OfficePatchResult> {
  const replacements = (opts.replacements || []).filter((r) =>
    String(r.find || '').length
  )
  if (!replacements.length) {
    throw new Error('مرّر replacements: [{ find, replace }].')
  }

  const zip = await JSZip.loadAsync(opts.buffer)
  const parts = await listEditableParts(zip, opts.format)
  if (parts.length === 0) {
    throw new Error('تعذّر العثور على أجزاء نصية قابلة للتعديل في الملف.')
  }

  let total = 0
  const details: Array<{ part: string; count: number }> = []
  const partsTouched: string[] = []
  const kind: 'w' | 'a' = opts.format === 'docx' ? 'w' : 'a'

  for (const part of parts) {
    const file = zip.file(part)
    if (!file) continue
    const original = await file.async('string')
    const { xml, count } = applyReplacementsToXml(original, kind, replacements)
    if (count > 0 && xml !== original) {
      zip.file(part, xml)
      total += count
      details.push({ part, count })
      partsTouched.push(part)
    }
  }

  if (total === 0) {
    throw new Error(
      'لم يُعثر على النص المطلوب استبداله داخل الملف. تأكد من النص الحرفي (بما في ذلك المسافات).'
    )
  }

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  })
  return {
    buffer: Buffer.from(out),
    format: opts.format,
    totalReplacements: total,
    partsTouched,
    details,
  }
}

/**
 * Fill {placeholders} in an existing DOCX/PPTX via docxtemplater (OSS core).
 * Preserves template layout; best when the source uses {tags}.
 */
export async function fillOfficeTemplate(opts: {
  buffer: Buffer | Uint8Array
  format: 'docx' | 'pptx'
  data: Record<string, unknown>
}): Promise<Buffer> {
  const PizZip = (await import('pizzip')).default
  const Docxtemplater = (await import('docxtemplater')).default
  const zip = new PizZip(opts.buffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  })
  doc.render(opts.data || {})
  const out = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  })
  return Buffer.from(out)
}
