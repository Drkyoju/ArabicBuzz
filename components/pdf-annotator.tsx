'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Eraser,
  Highlighter,
  Hand,
  Loader2,
  PenLine,
  Save,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  FilePlus2,
  FileX2,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  burnPdfAnnotations,
  clearSoftLayer,
  loadSoftLayer,
  mergeNearbyTextHighlights,
  newAnnoId,
  normalizeRectAnno,
  saveSoftLayer,
  type PdfAnnotateTool,
  type PdfAnnotation,
  type PdfNormPoint,
  type PdfTextHighlightAnno,
} from '@/lib/documents/pdf-annotate'
import {
  loadClientArabicFont,
  replaceWorkspacePdf,
  suggestAnnotatedCopyName,
  uploadWorkspacePdf,
} from '@/lib/files/pdf-annotate-save'
import {
  useFilePreviewStore,
} from '@/lib/files/preview-store'

type PdfjsDoc = {
  numPages: number
  getPage: (n: number) => Promise<PdfjsPage>
  destroy?: () => void
}

type PdfjsTextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

type PdfjsPage = {
  getViewport: (opts: { scale: number }) => {
    width: number
    height: number
  }
  getTextContent: () => Promise<{ items: PdfjsTextItem[] }>
  render: (opts: {
    canvas: HTMLCanvasElement
    canvasContext?: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => { promise: Promise<void> }
}

type TextLayerSpan = {
  key: string
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
}

const TOOL_META: {
  id: PdfAnnotateTool
  label: string
  title: string
  Icon: typeof PenLine
}[] = [
  { id: 'pan', label: 'تحريك', title: 'تحريك الصفحة', Icon: Hand },
  { id: 'pen', label: 'قلم', title: 'رسم حر', Icon: PenLine },
  {
    id: 'highlight',
    label: 'قلم تمييز',
    title: 'تمييز حر أصفر',
    Icon: Highlighter,
  },
  {
    id: 'textHighlight',
    label: 'تحديد نص',
    title: 'ظلّل بالنقر والسحب على النص (أو مستطيل إن لم توجد طبقة نص)',
    Icon: Highlighter,
  },
  { id: 'text', label: 'نص', title: 'إضافة نص', Icon: Type },
  {
    id: 'sticky',
    label: 'ملاحظة',
    title: 'ملاحظة لاصقة صفراء',
    Icon: StickyNote,
  },
  { id: 'rect', label: 'مربع', title: 'مستطيل', Icon: Square },
  { id: 'eraser', label: 'ممحاة', title: 'حذف تعليق بالنقر', Icon: Eraser },
]

const PEN_COLOR = '#0e5a46'
const HIGHLIGHT_COLOR = '#f5c542'
const RECT_COLOR = '#c45c26'
const TEXT_COLOR = '#1a1a1a'
const STICKY_COLOR = '#f5e6a3'

function promptEditText(initial: string, title: string): string | null {
  const next = window.prompt(title, initial)
  if (next === null) return null
  const t = next.trim()
  return t ? t.slice(0, 500) : ''
}

function clientRectsToHighlights(
  wrap: HTMLElement,
  pageIndex: number,
  rects: DOMRectList | DOMRect[]
): PdfTextHighlightAnno[] {
  const pageRect = wrap.getBoundingClientRect()
  if (pageRect.width < 1 || pageRect.height < 1) return []
  const out: PdfTextHighlightAnno[] = []
  const list = Array.from(rects as ArrayLike<DOMRect>)
  for (const r of list) {
    if (r.width < 2 || r.height < 2) continue
    const x = (r.left - pageRect.left) / pageRect.width
    const y = (r.top - pageRect.top) / pageRect.height
    const w = r.width / pageRect.width
    const h = r.height / pageRect.height
    if (w < 0.004 || h < 0.004) continue
    out.push(
      normalizeRectAnno({
        id: newAnnoId(),
        kind: 'textHighlight',
        pageIndex,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        w: Math.max(0.004, Math.min(1, w)),
        h: Math.max(0.006, Math.min(1, h)),
        color: HIGHLIGHT_COLOR,
        opacity: 0.38,
      })
    )
  }
  return out
}

function hitTest(
  anno: PdfAnnotation,
  p: PdfNormPoint,
  threshold = 0.02
): boolean {
  if (anno.kind === 'text') {
    return Math.hypot(anno.x - p.x, anno.y - p.y) < threshold * 2
  }
  if (
    anno.kind === 'rect' ||
    anno.kind === 'textHighlight' ||
    anno.kind === 'sticky'
  ) {
    const x0 = Math.min(anno.x, anno.x + anno.w)
    const x1 = Math.max(anno.x, anno.x + anno.w)
    const y0 = Math.min(anno.y, anno.y + anno.h)
    const y1 = Math.max(anno.y, anno.y + anno.h)
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  }
  for (const pt of anno.points) {
    if (Math.hypot(pt.x - p.x, pt.y - p.y) < threshold) return true
  }
  return false
}

function drawAnnosOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  annos: PdfAnnotation[]
) {
  ctx.clearRect(0, 0, width, height)
  for (const a of annos) {
    if (a.kind === 'pen' || a.kind === 'highlight') {
      if (a.points.length < 2) continue
      ctx.save()
      ctx.strokeStyle = a.color
      ctx.globalAlpha = a.opacity ?? (a.kind === 'highlight' ? 0.4 : 0.95)
      ctx.lineWidth = Math.max(1, a.width * width)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (a.kind === 'highlight') ctx.globalCompositeOperation = 'multiply'
      ctx.beginPath()
      ctx.moveTo(a.points[0]!.x * width, a.points[0]!.y * height)
      for (let i = 1; i < a.points.length; i++) {
        ctx.lineTo(a.points[i]!.x * width, a.points[i]!.y * height)
      }
      ctx.stroke()
      ctx.restore()
    } else if (a.kind === 'textHighlight') {
      ctx.save()
      ctx.fillStyle = a.color
      ctx.globalAlpha = a.opacity ?? 0.35
      ctx.fillRect(a.x * width, a.y * height, a.w * width, a.h * height)
      ctx.restore()
    } else if (a.kind === 'rect') {
      ctx.save()
      ctx.strokeStyle = a.color
      ctx.globalAlpha = a.opacity ?? 0.9
      ctx.lineWidth = Math.max(1, 0.002 * width)
      if (a.fill) {
        ctx.fillStyle = a.color
        ctx.globalAlpha = a.opacity ?? 0.25
        ctx.fillRect(a.x * width, a.y * height, a.w * width, a.h * height)
      } else {
        ctx.strokeRect(a.x * width, a.y * height, a.w * width, a.h * height)
      }
      ctx.restore()
    } else if (a.kind === 'sticky') {
      ctx.save()
      ctx.fillStyle = a.color || STICKY_COLOR
      ctx.globalAlpha = 0.92
      ctx.fillRect(a.x * width, a.y * height, a.w * width, a.h * height)
      ctx.strokeStyle = '#8a7020'
      ctx.lineWidth = 1
      ctx.strokeRect(a.x * width, a.y * height, a.w * width, a.h * height)
      ctx.fillStyle = '#1a1a1a'
      ctx.globalAlpha = 1
      ctx.font = `${Math.max(10, a.fontSize * height)}px sans-serif`
      ctx.direction = 'rtl'
      const lines = String(a.text || '').split('\n').slice(0, 6)
      let ly = a.y * height + a.fontSize * height + 4
      for (const line of lines) {
        ctx.fillText(line, a.x * width + a.w * width - 6, ly, a.w * width - 12)
        ly += a.fontSize * height * 1.25
      }
      ctx.restore()
    } else if (a.kind === 'text') {
      ctx.save()
      ctx.fillStyle = a.color
      ctx.font = `${Math.max(10, a.fontSize * height)}px sans-serif`
      ctx.direction = 'rtl'
      ctx.fillText(a.text, a.x * width, a.y * height)
      ctx.restore()
    }
  }
}

async function ensurePdfjs(): Promise<{
  getDocument: (opts: { data: ArrayBuffer; useSystemFonts?: boolean }) => {
    promise: Promise<PdfjsDoc>
  }
  GlobalWorkerOptions: { workerSrc: string }
  version: string
}> {
  const pdfjs = await import('pdfjs-dist')
  const version = pdfjs.version || '5.4.296'
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
  }
  return pdfjs as unknown as {
    getDocument: (opts: { data: ArrayBuffer; useSystemFonts?: boolean }) => {
      promise: Promise<PdfjsDoc>
    }
    GlobalWorkerOptions: { workerSrc: string }
    version: string
  }
}

function PdfPageView({
  doc,
  pageIndex,
  scale,
  annotations,
  tool,
  onChangeAnnos,
  drafting,
  setDrafting,
}: {
  doc: PdfjsDoc
  pageIndex: number
  scale: number
  annotations: PdfAnnotation[]
  tool: PdfAnnotateTool
  onChangeAnnos: (next: PdfAnnotation[]) => void
  drafting: PdfAnnotation | null
  setDrafting: (a: PdfAnnotation | null) => void
}) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const annoCanvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [textSpans, setTextSpans] = useState<TextLayerSpan[]>([])
  const drawingRef = useRef(false)
  const textSelectMode = tool === 'textHighlight'

  const pageAnnos = annotations.filter((a) => a.pageIndex === pageIndex)
  const draft =
    drafting && drafting.pageIndex === pageIndex ? drafting : null
  const visible = draft ? [...pageAnnos, draft] : pageAnnos

  useEffect(() => {
    let cancelled = false
    async function render() {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const pdfCanvas = pdfCanvasRef.current
      const annoCanvas = annoCanvasRef.current
      if (!pdfCanvas || !annoCanvas) return
      pdfCanvas.width = viewport.width
      pdfCanvas.height = viewport.height
      annoCanvas.width = viewport.width
      annoCanvas.height = viewport.height
      setSize({ w: viewport.width, h: viewport.height })
      const ctx = pdfCanvas.getContext('2d')
      if (!ctx) return
      await page.render({
        canvas: pdfCanvas,
        canvasContext: ctx,
        viewport,
      }).promise
      if (cancelled) return
      try {
        const content = await page.getTextContent()
        const vw = viewport.width
        const vh = viewport.height
        const spans: TextLayerSpan[] = []
        let i = 0
        for (const raw of content.items) {
          const item = raw as PdfjsTextItem
          const str = String(item.str || '')
          if (!str.trim() || !item.transform || item.transform.length < 6) {
            continue
          }
          const [, , , , tx, ty] = item.transform
          const fontHeight = Math.abs(item.transform[3] || item.height || 10)
          const w = Math.max(item.width || str.length * fontHeight * 0.45, 2)
          const h = Math.max(fontHeight, 6)
          // pdf.js text transform is bottom-left PDF space at scale 1; multiply by scale
          const left = tx * scale
          const top = vh - ty * scale - h * scale
          spans.push({
            key: `t${pageIndex}-${i++}`,
            text: str,
            left,
            top: Math.max(0, top),
            width: w * scale,
            height: h * scale,
            fontSize: Math.max(6, h * scale),
          })
        }
        if (!cancelled) setTextSpans(spans)
      } catch {
        if (!cancelled) setTextSpans([])
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [doc, pageIndex, scale])

  useEffect(() => {
    const canvas = annoCanvasRef.current
    if (!canvas || !size.w) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawAnnosOnCanvas(ctx, size.w, size.h, visible)
  }, [visible, size.w, size.h])

  const toNorm = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): PdfNormPoint | null => {
      const canvas = annoCanvasRef.current
      if (!canvas || !size.w) return null
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      }
    },
    [size.w]
  )

  function commitTextSelection() {
    const wrap = wrapRef.current
    if (!wrap || !textSelectMode) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount < 1) return
    const range = sel.getRangeAt(0)
    if (!wrap.contains(range.commonAncestorContainer)) return
    const rects = range.getClientRects()
    const highlights = clientRectsToHighlights(wrap, pageIndex, rects)
    sel.removeAllRanges()
    if (!highlights.length) return
    const next = mergeNearbyTextHighlights(
      [...annotations, ...highlights],
      pageIndex
    )
    onChangeAnnos(next)
  }

  function editHitAt(p: PdfNormPoint): boolean {
    const hit = [...pageAnnos]
      .reverse()
      .find(
        (a) =>
          (a.kind === 'sticky' || a.kind === 'text') && hitTest(a, p, 0.03)
      )
    if (!hit) return false
    if (hit.kind === 'sticky') {
      const next = promptEditText(hit.text, 'عدّل الملاحظة اللاصقة:')
      if (next === null) return true
      if (!next) {
        onChangeAnnos(annotations.filter((a) => a.id !== hit.id))
        return true
      }
      onChangeAnnos(
        annotations.map((a) =>
          a.id === hit.id && a.kind === 'sticky' ? { ...a, text: next } : a
        )
      )
      return true
    }
    if (hit.kind === 'text') {
      const next = promptEditText(hit.text, 'عدّل نص التعليق:')
      if (next === null) return true
      if (!next) {
        onChangeAnnos(annotations.filter((a) => a.id !== hit.id))
        return true
      }
      onChangeAnnos(
        annotations.map((a) =>
          a.id === hit.id && a.kind === 'text' ? { ...a, text: next } : a
        )
      )
      return true
    }
    return false
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === 'pan') return
    if (textSelectMode) return
    const p = toNorm(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (e.detail >= 2 && editHitAt(p)) return

    if (tool === 'eraser') {
      const hit = [...pageAnnos].reverse().find((a) => hitTest(a, p))
      if (hit) {
        onChangeAnnos(annotations.filter((a) => a.id !== hit.id))
      }
      return
    }

    if (tool === 'text') {
      const text = promptEditText('', 'أدخل النص للتعليق:')
      if (!text) return
      onChangeAnnos([
        ...annotations,
        {
          id: newAnnoId(),
          kind: 'text',
          pageIndex,
          x: p.x,
          y: p.y,
          text,
          fontSize: 0.028,
          color: TEXT_COLOR,
        },
      ])
      return
    }

    if (tool === 'sticky') {
      const text = promptEditText('', 'نص الملاحظة اللاصقة:')
      if (!text) return
      onChangeAnnos([
        ...annotations,
        {
          id: newAnnoId(),
          kind: 'sticky',
          pageIndex,
          x: Math.max(0, p.x - 0.11),
          y: Math.max(0, p.y - 0.02),
          w: 0.22,
          h: 0.12,
          text: text.slice(0, 400),
          color: STICKY_COLOR,
          fontSize: 0.018,
        },
      ])
      return
    }

    drawingRef.current = true
    if (tool === 'pen') {
      setDrafting({
        id: newAnnoId(),
        kind: 'pen',
        pageIndex,
        color: PEN_COLOR,
        width: 0.004,
        points: [p],
        opacity: 0.95,
      })
    } else if (tool === 'highlight') {
      setDrafting({
        id: newAnnoId(),
        kind: 'highlight',
        pageIndex,
        color: HIGHLIGHT_COLOR,
        width: 0.018,
        points: [p],
        opacity: 0.4,
      })
    } else if (tool === 'rect') {
      setDrafting({
        id: newAnnoId(),
        kind: 'rect',
        pageIndex,
        x: p.x,
        y: p.y,
        w: 0,
        h: 0,
        color: RECT_COLOR,
        fill: true,
        opacity: 0.22,
      })
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !drafting) return
    const p = toNorm(e)
    if (!p) return
    if (drafting.kind === 'pen' || drafting.kind === 'highlight') {
      const last = drafting.points[drafting.points.length - 1]
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.002) return
      setDrafting({ ...drafting, points: [...drafting.points, p] })
    } else if (drafting.kind === 'rect') {
      setDrafting({
        ...drafting,
        w: p.x - drafting.x,
        h: p.y - drafting.y,
      })
    }
  }

  function onPointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (!drafting || drafting.pageIndex !== pageIndex) {
      setDrafting(null)
      return
    }
    if (
      (drafting.kind === 'pen' || drafting.kind === 'highlight') &&
      drafting.points.length >= 2
    ) {
      onChangeAnnos([...annotations, drafting])
    } else if (
      drafting.kind === 'rect' &&
      Math.abs(drafting.w) > 0.005 &&
      Math.abs(drafting.h) > 0.005
    ) {
      onChangeAnnos([...annotations, normalizeRectAnno(drafting)])
    }
    setDrafting(null)
  }

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto mb-3 w-fit max-w-full overflow-hidden rounded-md border border-ab-border bg-white shadow-sm"
      dir="ltr"
    >
      <canvas ref={pdfCanvasRef} className="block max-w-full" />
      <canvas
        ref={annoCanvasRef}
        className={cn(
          'absolute inset-0 h-full w-full touch-none',
          tool === 'pan' || textSelectMode
            ? 'pointer-events-none'
            : 'cursor-crosshair'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {textSelectMode && textSpans.length > 0 ? (
        <div
          className="absolute inset-0 z-[1] select-text"
          style={{ width: size.w || undefined, height: size.h || undefined }}
          onMouseUp={() => {
            // Defer so selection is finalized
            window.setTimeout(() => commitTextSelection(), 0)
          }}
          onTouchEnd={() => {
            window.setTimeout(() => commitTextSelection(), 30)
          }}
        >
          {textSpans.map((s) => (
            <span
              key={s.key}
              style={{
                position: 'absolute',
                left: s.left,
                top: s.top,
                width: s.width,
                height: s.height,
                fontSize: s.fontSize,
                lineHeight: 1,
                color: 'transparent',
                whiteSpace: 'pre',
                cursor: 'text',
              }}
            >
              {s.text}
            </span>
          ))}
        </div>
      ) : null}
      {textSelectMode && textSpans.length === 0 && size.w > 0 ? (
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
          aria-label="تمييز مستطيل عند غياب طبقة النص"
          onPointerDown={(e) => {
            const wrap = wrapRef.current
            if (!wrap || !size.w) return
            const rect = wrap.getBoundingClientRect()
            const p = {
              x: Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width)
              ),
              y: Math.max(
                0,
                Math.min(1, (e.clientY - rect.top) / rect.height)
              ),
            }
            drawingRef.current = true
            setDrafting({
              id: newAnnoId(),
              kind: 'textHighlight',
              pageIndex,
              x: p.x,
              y: p.y,
              w: 0,
              h: 0,
              color: HIGHLIGHT_COLOR,
              opacity: 0.35,
            })
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current || !drafting) return
            if (drafting.kind !== 'textHighlight') return
            const wrap = wrapRef.current
            if (!wrap) return
            const rect = wrap.getBoundingClientRect()
            const p = {
              x: Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width)
              ),
              y: Math.max(
                0,
                Math.min(1, (e.clientY - rect.top) / rect.height)
              ),
            }
            setDrafting({
              ...drafting,
              w: p.x - drafting.x,
              h: p.y - drafting.y,
            })
          }}
          onPointerUp={() => {
            if (!drawingRef.current) return
            drawingRef.current = false
            if (
              drafting?.kind === 'textHighlight' &&
              drafting.pageIndex === pageIndex &&
              Math.abs(drafting.w) > 0.005 &&
              Math.abs(drafting.h) > 0.005
            ) {
              onChangeAnnos([
                ...annotations,
                normalizeRectAnno(drafting),
              ])
            }
            setDrafting(null)
          }}
        />
      ) : null}
      <span className="pointer-events-none absolute start-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
        {pageIndex + 1}
      </span>
    </div>
  )
}

export function PdfAnnotator({
  mediaUrl,
  fileId,
  scopeId,
  fileName,
  className,
}: {
  mediaUrl: string
  fileId: string
  scopeId: string
  fileName: string
  className?: string
}) {
  const bumpRevision = useFilePreviewStore((s) => s.bumpRevision)
  const notifyFileReady = useFilePreviewStore((s) => s.notifyFileReady)
  const openPreview = useFilePreviewStore((s) => s.openPreview)

  const [doc, setDoc] = useState<PdfjsDoc | null>(null)
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [tool, setTool] = useState<PdfAnnotateTool>('pen')
  const [drafting, setDrafting] = useState<PdfAnnotation | null>(null)
  const [scale, setScale] = useState(1.15)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [visiblePages, setVisiblePages] = useState(3)

  const dirty = annotations.length > 0
  const numPages = doc?.numPages ?? 0

  useEffect(() => {
    let cancelled = false
    let loaded: PdfjsDoc | null = null
    async function load() {
      setLoading(true)
      setError('')
      setAnnotations([])
      setDrafting(null)
      setNote('')
      try {
        const soft = loadSoftLayer(fileId)
        if (soft.length) {
          setAnnotations(soft)
          setNote(
            `استُعيدت طبقة قابلة للتحرير (${soft.length} تعليق) — احفظ كحرق أو أبقِ الطبقة.`
          )
        }
        const res = await fetch(mediaUrl)
        if (!res.ok) throw new Error('تعذّر تحميل PDF')
        const buf = await res.arrayBuffer()
        if (cancelled) return
        setOriginalBytes(buf.slice(0))
        const pdfjs = await ensurePdfjs()
        const task = pdfjs.getDocument({ data: buf.slice(0) })
        loaded = await task.promise
        if (cancelled) {
          loaded.destroy?.()
          return
        }
        setDoc(loaded)
        setVisiblePages(Math.min(3, loaded.numPages))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'فشل فتح PDF')
          setDoc(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      loaded?.destroy?.()
    }
  }, [mediaUrl, fileId])

  useEffect(() => {
    if (!fileId || annotations.length === 0) return
    saveSoftLayer(fileId, annotations)
  }, [annotations, fileId])

  useEffect(() => {
    function onResize() {
      const w = window.innerWidth
      setScale(w < 640 ? 0.85 : w < 1024 ? 1.05 : 1.2)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  async function buildAnnotatedBytes(): Promise<Uint8Array> {
    if (!originalBytes) throw new Error('لا بيانات PDF')
    const font = await loadClientArabicFont()
    return burnPdfAnnotations(originalBytes, annotations, {
      arabicFontBytes: font,
    })
  }

  async function onSaveReplace() {
    if (!dirty) {
      setNote('لا تعديلات للحفظ')
      return
    }
    setBusy(true)
    setError('')
    setNote('جاري حفظ التعليقات في الملف…')
    try {
      const bytes = await buildAnnotatedBytes()
      const result = await replaceWorkspacePdf({
        scopeId,
        fileId,
        bytes,
        fileName,
      })
      setAnnotations([])
      clearSoftLayer(fileId)
      setNote(result.messageAr || 'حُفظت التعليقات في الملف')
      bumpRevision()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveAnnotatedCopy() {
    if (!dirty) {
      setNote('أضف تعليقاً أولاً ثم احفظ نسخة')
      return
    }
    setBusy(true)
    setError('')
    setNote('جاري حفظ نسخة معلّقة…')
    try {
      const bytes = await buildAnnotatedBytes()
      const name = suggestAnnotatedCopyName(fileName, 'annotated')
      const result = await uploadWorkspacePdf({
        scopeId,
        bytes,
        fileName: name,
      })
      setNote(result.messageAr || `حُفظت نسخة: ${name}`)
      openPreview({
        fileId: result.file.id,
        scopeId,
        name: result.file.originalName || name,
        mimeType: 'application/pdf',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حفظ النسخة')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveCleanCopy() {
    if (!originalBytes) return
    setBusy(true)
    setError('')
    setNote('جاري حفظ ملف نظيف بدون تعليقات…')
    try {
      const name = suggestAnnotatedCopyName(fileName, 'clean')
      const result = await uploadWorkspacePdf({
        scopeId,
        bytes: new Uint8Array(originalBytes),
        fileName: name,
      })
      setNote(
        result.messageAr ||
          `حُفظ ملف نظيف بدون تمييز/قلم: ${result.file.originalName || name}`
      )
      notifyFileReady({
        fileId: result.file.id,
        scopeId,
        name: result.file.originalName || name,
        mimeType: 'application/pdf',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حفظ الملف النظيف')
    } finally {
      setBusy(false)
    }
  }

  function onDiscard() {
    if (!dirty) {
      setNote('لا تعليقات غير محفوظة')
      return
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm('تجاهل كل التعليقات غير المحفوظة؟')
    ) {
      return
    }
    setAnnotations([])
    setDrafting(null)
    clearSoftLayer(fileId)
    setNote('تُجاهلت التعليقات — الملف الأصلي كما هو')
  }

  function onSaveSoftOnly() {
    if (!dirty) {
      setNote('لا تعليقات لحفظ الطبقة')
      return
    }
    saveSoftLayer(fileId, annotations)
    setNote(
      'حُفظت طبقة قابلة للتحرير محلياً في المتصفح — لن تُحرق في PDF حتى تضغط «حفظ في الملف».'
    )
  }

  function onUndo() {
    setAnnotations((prev) => prev.slice(0, -1))
  }

  if (loading) {
    return (
      <div
        className={cn(
          'flex min-h-[16rem] items-center justify-center gap-2 text-sm text-ab-muted',
          className
        )}
        dir="rtl"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        جاري تجهيز معاينة PDF…
      </div>
    )
  }

  if (error && !doc) {
    return (
      <div className={cn('space-y-2', className)} dir="rtl">
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
        <iframe
          title={fileName}
          src={mediaUrl}
          className="h-full min-h-[24rem] w-full rounded-md border border-ab-border bg-white"
        />
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)} dir="rtl">
      <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border border-ab-border bg-white/80 p-1.5">
        {TOOL_META.map(({ id, label, title, Icon }) => (
          <button
            key={id}
            type="button"
            title={title}
            disabled={busy}
            onClick={() => setTool(id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              tool === id
                ? 'bg-ab-accent text-white'
                : 'text-ab-ink hover:bg-stone-100'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-ab-border" aria-hidden />
        <button
          type="button"
          title="تراجع"
          disabled={busy || !dirty}
          onClick={onUndo}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-100 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          تراجع
        </button>
        <button
          type="button"
          title="تجاهل التعليقات"
          disabled={busy || !dirty}
          onClick={onDiscard}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-100 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          تجاهل
        </button>
        <span className="mx-0.5 h-4 w-px bg-ab-border" aria-hidden />
        <button
          type="button"
          title="حفظ طبقة قابلة للتحرير (محلي — بدون حرق)"
          disabled={busy || !dirty}
          onClick={onSaveSoftOnly}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-50 disabled:opacity-40"
        >
          <Layers className="h-3.5 w-3.5" />
          طبقة ناعمة
        </button>
        <button
          type="button"
          title="حفظ في نفس الملف (حرق دائم)"
          disabled={busy || !dirty}
          onClick={() => void onSaveReplace()}
          className="inline-flex items-center gap-1 rounded-md bg-ab-accent px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          حفظ (حرق)
        </button>
        <button
          type="button"
          title="حفظ نسخة معلّقة جديدة"
          disabled={busy || !dirty}
          onClick={() => void onSaveAnnotatedCopy()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-50 disabled:opacity-40"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          نسخة معلّقة
        </button>
        <button
          type="button"
          title="ملف جديد بدون تعليقات"
          disabled={busy || !originalBytes}
          onClick={() => void onSaveCleanCopy()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-ab-ink hover:bg-stone-50 disabled:opacity-40"
        >
          <FileX2 className="h-3.5 w-3.5" />
          بدون تعديل
        </button>
      </div>

      <p className="shrink-0 text-[10px] leading-relaxed text-ab-muted">
        تحديد نص: اسحب فوق الكلمات لتظليلها · ملاحظة/نص: نقر مزدوج لإعادة التحرير
        · «طبقة ناعمة» محلية قابلة للتحرير قبل الحرق · ممحاة تحذف من الطبقة.
        {dirty ? ` · ${annotations.length} تعليق` : ''}
      </p>

      {(note || error) && (
        <p
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1.5 text-[11px]',
            error
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
          )}
        >
          {error || note}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-stone-100/80 p-2">
        {doc &&
          Array.from({ length: Math.min(visiblePages, numPages) }, (_, i) => (
            <PdfPageView
              key={`${fileId}-p${i}`}
              doc={doc}
              pageIndex={i}
              scale={scale}
              annotations={annotations}
              tool={tool}
              onChangeAnnos={setAnnotations}
              drafting={drafting}
              setDrafting={setDrafting}
            />
          ))}
        {doc && visiblePages < numPages && (
          <button
            type="button"
            className="mx-auto mb-2 block rounded-md border border-ab-border bg-white px-3 py-1.5 text-[12px] text-ab-ink hover:bg-stone-50"
            onClick={() =>
              setVisiblePages((n) => Math.min(numPages, n + 5))
            }
          >
            عرض المزيد ({visiblePages}/{numPages})
          </button>
        )}
      </div>
    </div>
  )
}
