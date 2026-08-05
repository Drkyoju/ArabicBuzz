/**
 * Accreditation export pack: minutes + attendance + file list → one PDF + audit stamp.
 */
import {
  buildPdfFromText,
  mergePdfs,
  stampPdf,
  shapeArabicForPdf,
} from '@/lib/documents/pdf'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as fontkit from '@pdf-lib/fontkit'
import { reportRoomMembersAttendance } from '@/lib/rooms/association-reports'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { logSDAIAEvent } from '@/lib/audit/logger'
import { calculatePromptHash } from '@/lib/audit/provenance'

async function stampSdaiaAllPages(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf)
  doc.registerFontkit(fontkit)
  let font
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf'
    )
    if (res.ok) {
      font = await doc.embedFont(new Uint8Array(await res.arrayBuffer()), {
        subset: true,
      })
    } else {
      font = await doc.embedFont(StandardFonts.Helvetica)
    }
  } catch {
    font = await doc.embedFont(StandardFonts.Helvetica)
  }
  const ts = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })
  const line = shapeArabicForPdf(
    `Arabic Buzz · ختم التدقيق · ${ts}`
  )
  for (const page of doc.getPages()) {
    const { width } = page.getSize()
    page.drawText(line, {
      x: 36,
      y: 28,
      size: 8,
      font,
      color: rgb(0.2, 0.45, 0.35),
      maxWidth: width - 72,
    })
  }
  return Buffer.from(await doc.save())
}

export async function buildAccreditationPack(opts: {
  scopeId: string
  titleAr?: string
  minutesAr?: string
  meetingDateAr?: string
  fileIds?: string[]
  includeAttendance?: boolean
  userId?: string
}): Promise<{
  ok: boolean
  fileId?: string
  fileName?: string
  messageAr: string
  error?: string
}> {
  const scopeId = opts.scopeId || 'shared-demo'
  const titleAr =
    opts.titleAr?.trim() || 'حزمة اعتماد — محضر واجتماع'
  const parts: Buffer[] = []

  // 1) Cover + minutes
  const coverParas = [
    titleAr,
    opts.meetingDateAr
      ? `تاريخ الاجتماع: ${opts.meetingDateAr}`
      : `تاريخ التصدير: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
    '—',
    'المحضر',
    opts.minutesAr?.trim() ||
      'لم يُرفق نص محضر — أضفه من لوحة التصدير أو من مساعد الاجتماع.',
  ]
  parts.push(
    await buildPdfFromText({
      title: titleAr,
      paragraphs: coverParas,
    })
  )

  // 2) Attendance
  if (opts.includeAttendance !== false) {
    const report = await reportRoomMembersAttendance({ scopeId, days: 30 })
    const lines = [
      'سجل الحضور والنشاط',
      report.summaryAr,
      '—',
      ...report.members.map(
        (m) =>
          `${m.nameAr}${m.email ? ` · ${m.email}` : ''} · الدور: ${m.role} · إجراءات (30 يوماً): ${m.actionsLastDays}`
      ),
    ]
    if (report.topActors.length) {
      lines.push('—', 'الأكثر نشاطاً:')
      for (const a of report.topActors.slice(0, 10)) {
        lines.push(`${a.nameAr}: ${a.actions} إجراء`)
      }
    }
    parts.push(await buildPdfFromText({ paragraphs: lines }))
  }

  // 3) File index (+ optional PDF attachments)
  const files = await listWorkspaceFiles(scopeId)
  const selected = (opts.fileIds?.length
    ? files.filter((f) => opts.fileIds!.includes(f.id))
    : files.slice(0, 12)
  )
  const indexLines = [
    'قائمة الملفات المرفقة / المفهرسة',
    ...selected.map(
      (f, i) =>
        `${i + 1}. ${f.originalName} · ${Math.round((f.size || 0) / 1024)} ك.ب`
    ),
  ]
  if (!selected.length) {
    indexLines.push('لا ملفات في مساحة الغرفة حالياً.')
  }
  parts.push(await buildPdfFromText({ paragraphs: indexLines }))

  for (const f of selected.slice(0, 5)) {
    if (!/pdf/i.test(f.mimeType || '') && !/\.pdf$/i.test(f.originalName)) {
      continue
    }
    try {
      const hit = await readWorkspaceFile(scopeId, f.id)
      parts.push(Buffer.from(hit.buffer))
    } catch {
      /* skip unreadable */
    }
  }

  let merged = await mergePdfs(parts)
  // Extra front stamp then footer on all pages
  merged = await stampPdf({
    pdf: merged,
    text: 'حزمة اعتماد · Arabic Buzz · ختم التدقيق',
    pageIndex: 0,
    size: 11,
  })
  merged = await stampSdaiaAllPages(merged)

  const fileName = `حزمة-اعتماد-${Date.now()}.pdf`
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: merged,
    originalName: fileName,
    mimeType: 'application/pdf',
  })

  try {
    await logSDAIAEvent({
      scopeId,
      userId: opts.userId || 'system',
      modelUsed: 'accreditation-export',
      promptHash: calculatePromptHash(titleAr + (opts.minutesAr || '')),
      responseHash: calculatePromptHash(fileName + String(merged.length)),
      riskTier: 'TIER_2_MEDIUM',
      dataLocality: 'EXTERNAL_CLOUD',
    })
  } catch {
    /* audit optional */
  }

  return {
    ok: true,
    fileId: saved.file.id,
    fileName: saved.file.originalName || fileName,
    messageAr: `صُدّرت حزمة الاعتماد «${fileName}» بختم التدقيق إلى ملفات الغرفة.`,
  }
}
