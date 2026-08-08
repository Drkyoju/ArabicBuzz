/**
 * Map capability-gap tasks → known free builtin tools/libs already in ArabicBuzz.
 * Prefer executing these over suggesting remote MCPs or paid APIs.
 * Never recommend downloading/running untrusted remote code blindly.
 */
export type FreeExecuteHint = {
  /** Native tool name the agent must call next */
  toolName: string
  /** Free library already available (or documented local path) */
  libAr: string
  whyAr: string
  instructionAr: string
}

type Rule = {
  re: RegExp
  hints: FreeExecuteHint[]
}

const RULES: Rule[] = [
  {
    re: /(?:كرر|انسخ|نسخ|duplicate|copy)\s*(?:صفح|page)|pdf_duplicate|صفح[ةه]\s*\d+\s*(?:بعد|after)/iu,
    hints: [
      {
        toolName: 'pdf_duplicate_page',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'نسخ/إدراج صفحة PDF متاح مجاناً محلياً',
        instructionAr:
          'نفّذ فوراً pdf_duplicate_page (mode=copy للمحتوى؛ blank فقط إن طُلبت صفحة بيضاء) ثم return_file كمرفق تيليجرام. ممنوع طلب إعادة الإرسال.',
      },
    ],
  },
  {
    re: /(?:ادمج|دمج|merge)\s*(?:pdf|صفحات)|pdf_merge/iu,
    hints: [
      {
        toolName: 'pdf_merge',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'دمج PDF مجاني مدمج',
        instructionAr: 'نفّذ pdf_merge ثم return_file فوراً.',
      },
    ],
  },
  {
    re: /(?:عل[ّ]?ق|تعليق|تمييز|highlight|sticky|قلم|pdf_annotate|ختم|ختمة)/iu,
    hints: [
      {
        toolName: 'pdf_annotate',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'تعليق PDF مجاني مدمج',
        instructionAr: 'نفّذ pdf_annotate أو pdf_stamp ثم return_file.',
      },
    ],
  },
  {
    re: /(?:استبدل|بد[ّ]?ل)\s*(?:نص|كلمة)|pdf_replace/iu,
    hints: [
      {
        toolName: 'pdf_replace_text',
        libAr: 'PyMuPDF / HarfBuzz (محلي)',
        whyAr: 'استبدال نص عربي عبر مسار مجاني محلي',
        instructionAr: 'نفّذ pdf_replace_text ثم return_file. لا تستخدم مساراً مدفوعاً.',
      },
    ],
  },
  {
    re: /(?:حو[ّ]?ل|convert).*(?:pdf|word|ورد|excel|xlsx|pptx)|(?:pdf).*(?:word|ورد)|libreoffice|google\s*drive\s*convert/iu,
    hints: [
      {
        toolName: 'convert_document',
        libAr: 'LibreOffice / Google Drive (مجاني إن مربوط)',
        whyAr: 'تحويل المستندات عبر مسار مجاني مدمج',
        instructionAr:
          'نفّذ convert_document فوراً (Gemini→Paddle للـ OCR إن لزم؛ بدون Mistral إلا بعلم صريح). ثم return_file.',
      },
    ],
  },
  {
    re: /(?:ocr|امسح\s*ضوئي|قراءة\s*مسح|استخرج\s*نص)/iu,
    hints: [
      {
        toolName: 'arabic_ocr',
        libAr: 'Tesseract / Qari / Gemini (مجاني أولاً)',
        whyAr: 'OCR عربي عبر سلسلة مجانية',
        instructionAr: 'نفّذ arabic_ocr فوراً وأعد النص أو الملف الناتج.',
      },
    ],
  },
  {
    re: /(?:صفحة\s*بيضاء|blank\s*page|pdf_insert_blank)/iu,
    hints: [
      {
        toolName: 'pdf_insert_blank_page',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'إدراج صفحة بيضاء مجاني',
        instructionAr: 'نفّذ pdf_insert_blank_page ثم return_file.',
      },
    ],
  },
  {
    re: /(?:عد[ّ]?ل|نس[ّ]?ق|حر[ّ]?ر).*(?:word|ورد|docx|مستند)|edit_document/iu,
    hints: [
      {
        toolName: 'edit_document',
        libAr: 'docx (مدمج)',
        whyAr: 'تعديل Word مجاني مدمج',
        instructionAr: 'نفّذ edit_document ثم return_file — بدون سؤال تأكيد.',
      },
    ],
  },
  {
    re: /(?:عد[ّ]?ل|نس[ّ]?ق).*(?:excel|xlsx|جدول)|edit_excel/iu,
    hints: [
      {
        toolName: 'edit_excel',
        libAr: 'ExcelJS (مدمج)',
        whyAr: 'تعديل Excel مجاني مدمج',
        instructionAr: 'نفّذ edit_excel ثم return_file — بدون سؤال تأكيد.',
      },
    ],
  },
  {
    re: /(?:ابحث|دور|إحاطة|room_search|owner_morning)/iu,
    hints: [
      {
        toolName: 'room_search',
        libAr: 'بحث الغرفة المدمج',
        whyAr: 'بحث مجاني في الغرفة/البريد/التقويم',
        instructionAr: 'نفّذ room_search أو owner_morning_brief فوراً وأعد النتيجة.',
      },
    ],
  },
]

/** Builtin free tools that can run the task without user payment. */
export function mapTaskToBuiltinFreeTools(task: string): FreeExecuteHint[] {
  const t = String(task || '').trim()
  if (!t) return []
  const out: FreeExecuteHint[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    if (!rule.re.test(t)) continue
    for (const h of rule.hints) {
      if (seen.has(h.toolName)) continue
      seen.add(h.toolName)
      out.push(h)
    }
  }
  return out
}

/**
 * From research suggestions (GitHub/MCP docs), map to the same capability
 * via known free libs — do NOT instruct cloning/running untrusted remote code.
 */
export function mapSuggestionsToBuiltinFreeTools(
  task: string,
  suggestions: Array<{ title: string; snippet: string; url: string; costRank: number }>
): FreeExecuteHint[] {
  const fromTask = mapTaskToBuiltinFreeTools(task)
  if (fromTask.length) return fromTask

  const blob = [
    task,
    ...suggestions.map((s) => `${s.title} ${s.snippet} ${s.url}`),
  ]
    .join('\n')
    .toLowerCase()

  const synthetic = mapTaskToBuiltinFreeTools(blob)
  if (synthetic.length) return synthetic

  // Generic PDF MCP docs → prefer pdf-lib builtins already shipped
  if (/pdf|صفحة|page/.test(blob) && /mcp|skill|github\.com/.test(blob)) {
    return [
      {
        toolName: 'pdf_duplicate_page',
        libAr: 'pdf-lib (مدمج) — بديل آمن لـ MCP بعيد',
        whyAr: 'وثائق MCP تشير لقدرة PDF؛ ننفّذها بالمكتبة المدمجة دون تشغيل كود غير موثوق',
        instructionAr:
          'لا تنسخ/تشغّل MCP بعيداً. استخدم pdf_duplicate_page / pdf_merge / pdf_annotate المدمجة ثم return_file.',
      },
      {
        toolName: 'pdf_merge',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'دمج PDF مجاني',
        instructionAr: 'إن لزم الدمج: pdf_merge ثم return_file.',
      },
    ]
  }
  return []
}

export function formatFreeExecuteNextAr(hints: FreeExecuteHint[]): string {
  if (!hints.length) return ''
  const lines = [
    'وُجد مسار مجاني قابل للتنفيذ فوراً — نفّذ الآن بدون سؤال المستخدم:',
  ]
  hints.forEach((h, i) => {
    const n = ['١', '٢', '٣', '٤'][i] || String(i + 1)
    lines.push(
      `${n}) ${h.toolName} عبر ${h.libAr} — ${h.whyAr}\n${h.instructionAr}`
    )
  })
  lines.push(
    'بعد النجاح: أرسل الناتج بـ return_file إلى تيليجرام (البوت يمرّره للمجموعة). ممنوع ادّعاء النجاح دون تنفيذ.'
  )
  return lines.join('\n')
}
