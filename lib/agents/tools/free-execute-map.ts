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
    re: /(?:صفح[ةه]\s*(?:فاضي[ةه]|فارغ[ةه])|(?:فاضي[ةه]|فارغ[ةه]).{0,30}صفح|(?:بدون|بلا)\s*(?:كتاب[ةه]|نص)).{0,80}(?:بعد|after)|findEmptyPage/iu,
    hints: [
      {
        toolName: 'pdf_duplicate_page',
        libAr: 'pdf-lib (مدمج)',
        whyAr:
          'نسخ صفحة فاضية موجودة (متن فارغ؛ ترويسة/شعار أعلى الصفحة مقبول مثل ص49 — ليست بسم الله) مجاناً محلياً',
        instructionAr:
          'نفّذ فوراً pdf_duplicate_page مع findEmptyPage=true وafterPage المطلوب ثم return_file. صفحة فاضية = متن فارغ (ترويسة/شعار مقبول). ممنوع بسم الله/ص2 وممنوع mode=blank وممنوع افتراض copyPage=48 وممنوع اختراع صفحة بيضاء. إن لم توجد أبلغ المجموعة.',
      },
    ],
  },
  {
    re: /(?:كرر|انسخ|نسخ|duplicate|copy)\s*(?:صفح|page)|pdf_duplicate|صفح[ةه]\s*\d+\s*(?:بعد|after)/iu,
    hints: [
      {
        toolName: 'pdf_duplicate_page',
        libAr: 'pdf-lib (مدمج)',
        whyAr: 'نسخ/إدراج صفحة PDF متاح مجاناً محلياً',
        instructionAr:
          'نفّذ فوراً pdf_duplicate_page (mode=duplicate لنسخ محتوى صفحة مرقّمة؛ findEmptyPage=true لصفحة فاضية موجودة؛ blank فقط إن طُلبت صفحة بيضاء مخترعة) ثم return_file كمرفق تيليجرام. ممنوع طلب إعادة الإرسال.',
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
        whyAr: 'إدراج صفحة بيضاء مخترعة مجاني',
        instructionAr:
          'نفّذ pdf_insert_blank_page ثم return_file. إن طُلبت «صفحة فاضية» من الملف استخدم pdf_duplicate_page+findEmptyPage بدل هذه الأداة.',
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
  {
    re: /(?:بحث\s*(?:ويب|انترنت|google|جوجل)|web[\s_-]?search|duckduckgo|site:\s*gov\.sa|مصادر?\s*رسمي)/iu,
    hints: [
      {
        toolName: 'web_search',
        libAr: 'DuckDuckGo + Wikipedia + gov.sa (مدمج بلا مفتاح)',
        whyAr: 'بحث ويب مجاني مدمج — لا Firecrawl/Brave مطلوب',
        instructionAr:
          'نفّذ web_search فوراً. إن احتجت نص الصفحة: web_fetch أو ingest_url_to_brain (Jina Reader مجاني). لا تطلب مفتاحاً مدفوعاً.',
      },
    ],
  },
  {
    re: /(?:ويكيبيديا|wikipedia|ملخص\s*مقال)/iu,
    hints: [
      {
        toolName: 'wikipedia_lookup',
        libAr: 'MediaWiki REST (مجاني)',
        whyAr: 'ملخص ويكيبيديا مخصص بلا مفتاح — مطابق Hermes wikipedia MCP',
        instructionAr:
          'نفّذ wikipedia_lookup فوراً (lang=ar افتراضي). إن احتجت بحثاً أوسع: web_search.',
      },
    ],
  },
  {
    re: /(?:يوتيوب|youtube|تفريغ\s*(?:فيديو|يوتيوب)|transcript|كابشن|ترجمة\s*الفيديو)/iu,
    hints: [
      {
        toolName: 'youtube_transcript',
        libAr: 'YouTube timedtext / captions (مجاني)',
        whyAr: 'تفريغ كابشن يوتيوب بلا مفتاح — مطابق Hermes youtube-transcript',
        instructionAr:
          'نفّذ youtube_transcript مع الرابط أو videoId ثم لخّص بالعربية.',
      },
    ],
  },
  {
    re: /(?:احسب|حساب|math[\s_-]?eval|معادل[ةه]|sqrt|جذر|\d+\s*[+\-×x*/÷^]\s*\d+)/iu,
    hints: [
      {
        toolName: 'math_eval',
        libAr: 'حاسبة تعبيرات مدمجة (آمنة)',
        whyAr: 'حساب محلي بلا مفتاح — مطابق Hermes math MCP',
        instructionAr: 'نفّذ math_eval مع expression فوراً وأعد الرقم.',
      },
    ],
  },
  {
    re: /(?:whois|rdap|dns|استعلام\s*نطاق|domain[\s_-]?intel|معلومات\s*(?:النطاق|الدومين)|nslookup)/iu,
    hints: [
      {
        toolName: 'domain_intel',
        libAr: 'dns.google + RDAP (مجاني)',
        whyAr: 'استعلام DNS/RDAP بلا مفتاح — مطابق Hermes domain-intel / dns MCP',
        instructionAr: 'نفّذ domain_intel مع اسم النطاق فوراً.',
      },
    ],
  },
  {
    re: /(?:arxiv|أركسيف|ورقة\s*علمي|بحث\s*علمي|preprint)/iu,
    hints: [
      {
        toolName: 'arxiv_search',
        libAr: 'arXiv Atom API (مجاني)',
        whyAr: 'بحث أوراق علمية بلا مفتاح',
        instructionAr: 'نفّذ arxiv_search فوراً وأعد العناوين + روابط PDF.',
      },
    ],
  },
  {
    re: /(?:سعر\s*صرف|حو[ّ]?ل.{0,24}(?:دولار|ريال|يورو|USD|SAR|EUR)|fx[\s_-]?rate|exchange\s*rate|\bUSD\b|\bSAR\b|\bEUR\b)/iu,
    hints: [
      {
        toolName: 'fx_rate',
        libAr: 'open.er-api (مجاني، يشمل SAR)',
        whyAr: 'أسعار صرف بلا مفتاح',
        instructionAr: 'نفّذ fx_rate مع from/to/amount.',
      },
    ],
  },
  {
    re: /(?:إحداثي|ترميز\s*جغراف|geocode|أين\s*(?:تقع|موقع)|إحداثيات|nominatim|خريط[ةه]|موقع\s+(?:ال|على\s*ال)?(?:خريط|جوجل|maps)|وين\s+(?:تقع|موقع)|google\s*maps|openstreetmap)/iu,
    hints: [
      {
        toolName: 'geocode',
        libAr: 'Nominatim/OSM (مجاني) + روابط خرائط',
        whyAr: 'ترميز جغرافي + OSM/Google Maps بلا مفتاح',
        instructionAr:
          'نفّذ geocode باسم المكان ثم انشر الإحداثيات وروابط osmUrl/googleMapsUrl من النتيجة — بلا شرح مطوّل.',
      },
    ],
  },
  {
    re: /(?:أنشئ|انشئ|اكتب|سو[يّ]|جه[ّ]?ز|حض[ّ]?ر)\s*(?:لي\s*)?(?:ملف|مستند|وثيق|مذكرة|ملاحظة|نص|ورد|وورد|word|pdf)|(?:ملف|مستند)\s*جديد|من\s*(?:الصفر|scratch)|create\s*(?:a\s*)?(?:file|doc|document)/iu,
    hints: [
      {
        toolName: 'write_file',
        libAr: 'خزنة الغرفة (write_file / brain_create_document / pdf_create)',
        whyAr: 'إنشاء ملف جديد من الصفر ثم return_file لتيليجرام',
        instructionAr:
          'أنشئ الملف فوراً عبر write_file أو brain_create_document أو pdf_create بالمحتوى المطلوب ثم return_file. ممنوع البحث في Drive أولاً إن طُلب ملف جديد.',
      },
    ],
  },
  {
    re: /(?:تعريف|معنى|قاموس|dictionary|define\s+)/iu,
    hints: [
      {
        toolName: 'dictionary_lookup',
        libAr: 'Free Dictionary API (إنجليزي)',
        whyAr: 'تعريفات إنجليزية مجانية؛ للعربية wikipedia_lookup',
        instructionAr:
          'إن كانت الكلمة إنجليزية: dictionary_lookup. إن عربية: wikipedia_lookup.',
      },
    ],
  },
  {
    re: /(?:hacker\s*news|\bhn\b|هاكر\s*نيوز)/iu,
    hints: [
      {
        toolName: 'hn_search',
        libAr: 'HN Algolia (مجاني)',
        whyAr: 'بحث تقني مجاني على HN',
        instructionAr: 'نفّذ hn_search فوراً.',
      },
    ],
  },
  {
    re: /(?:جلب|افتح|اقرأ).{0,40}(?:رابط|url|صفحة|موقع)|web[\s_-]?fetch|ingest_url|jina/iu,
    hints: [
      {
        toolName: 'web_fetch',
        libAr: 'جلب مباشر + Jina Reader (مجاني)',
        whyAr: 'قراءة صفحات عامة بلا مفتاح',
        instructionAr:
          'نفّذ web_fetch ثم إن لزم ingest_url_to_brain. لا تستخدم Firecrawl إلا إن وُجد مفتاح صراحة.',
      },
    ],
  },
  {
    re: /(?:drive|درايف|جوجل\s*درايف|google\s*drive|مجلد\s*الجمعية|drive_search|drive_sync)/iu,
    hints: [
      {
        toolName: 'drive_search_files',
        libAr: 'Google Drive الأصلي (OAuth المنتج)',
        whyAr: 'بحث Drive مجاني عبر الربط الموجود — بدون MCP Workspace منفصل',
        instructionAr:
          'نفّذ drive_search_files أو drive_sync_brain ثم search_knowledge_base. لا تثبّت MCP Drive بعيداً غير موثوق.',
      },
    ],
  },
  {
    re: /(?:find_storage_mesh|شبكة\s*التخزين|دور\s*في\s*الشبكة|ملف\s*مفقود|وين\s*الملف|استأنف\s*الملف)/iu,
    hints: [
      {
        toolName: 'find_storage_mesh',
        libAr: 'شبكة التخزين المدمجة (Drive→TG→غرفة→ماك)',
        whyAr: 'بحث مجاني عبر كل المخازن بدون إعادة إرسال',
        instructionAr:
          'نفّذ find_storage_mesh فوراً. ممنوع «أعد الإرسال» إن وُجدت نسخة أو مهمة معلّقة.',
      },
    ],
  },
  {
    re: /(?:أرشف|ارشف|archive).{0,40}(?:مجموع|قروب|تيليجرام|telegram|مجموعة)|archive_telegram/iu,
    hints: [
      {
        toolName: 'archive_telegram_group',
        libAr: 'أرشفة تيليجرام→Drive المدمجة',
        whyAr: 'أرشفة مجانية لوسائط المجموعة إلى Drive والخزنة',
        instructionAr:
          'نفّذ archive_telegram_group فوراً ثم لخّص النتيجة للمجموعة. لا تطلب إعادة إرسال الملفات.',
      },
    ],
  },
  {
    re: /(?:بريد|gmail|إيميل|mail_search|gmail_search|mail_corpus|مسودة\s*رد|اكتب\s*رد)/iu,
    hints: [
      {
        toolName: 'mail_search',
        libAr: 'Gmail / mail المدمج',
        whyAr: 'بحث كل بريد الجمعية (وارد+مرسل) عبر أدوات المنتج المجانية',
        instructionAr:
          'نفّذ mail_search أو mail_corpus_search للبحث في كل الرسائل، أو mail_draft_reply للرسالة المفتوحة.',
      },
      {
        toolName: 'mail_draft_reply',
        libAr: 'مسودة رد بريد الجمعية',
        whyAr: 'قراءة الرسالة المفتوحة وكتابة رد كامل للمراجعة قبل الإرسال',
        instructionAr:
          'إن فُتحت رسالة: mail_draft_reply. وإلا mail_search ثم mail_read ثم mail_draft_reply.',
      },
    ],
  },
  {
    re: /(?:github|غيتهب|مستودع|pull\s*request|\bpr\b|issue|ci\b)/iu,
    hints: [
      {
        toolName: 'web_search',
        libAr: 'بحث GitHub العام + أدوات المنتج',
        whyAr: 'قراءة عامة عبر الويب بلا مفتاح؛ MCP GitHub اختياري بـ PAT',
        instructionAr:
          'ابحث عبر web_search (site:github.com …). لا تفترض وجود GITHUB_PERSONAL_ACCESS_TOKEN.',
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

  // Web / research MCP docs → free product path
  if (/web|search|duckduckgo|fetch|firecrawl|jina|brave/.test(blob)) {
    return [
      {
        toolName: 'web_search',
        libAr: 'DuckDuckGo + Wikipedia + gov.sa',
        whyAr: 'مسار بحث مجاني مدمج بدل MCP مدفوع',
        instructionAr: 'نفّذ web_search ثم web_fetch/ingest_url_to_brain عند الحاجة.',
      },
    ]
  }

  if (/wikipedia|wiki/.test(blob)) {
    return [
      {
        toolName: 'wikipedia_lookup',
        libAr: 'MediaWiki REST',
        whyAr: 'ويكيبيديا مدمجة بلا مفتاح',
        instructionAr: 'نفّذ wikipedia_lookup.',
      },
    ]
  }

  if (/youtube|transcript|timedtext/.test(blob)) {
    return [
      {
        toolName: 'youtube_transcript',
        libAr: 'YouTube captions',
        whyAr: 'تفريغ يوتيوب مدمج',
        instructionAr: 'نفّذ youtube_transcript.',
      },
    ]
  }

  if (/math|calculator|expression/.test(blob)) {
    return [
      {
        toolName: 'math_eval',
        libAr: 'حاسبة مدمجة',
        whyAr: 'حساب محلي بلا مفتاح',
        instructionAr: 'نفّذ math_eval.',
      },
    ]
  }

  if (/whois|rdap|dns|domain/.test(blob)) {
    return [
      {
        toolName: 'domain_intel',
        libAr: 'dns.google + RDAP',
        whyAr: 'استعلام نطاق مجاني',
        instructionAr: 'نفّذ domain_intel.',
      },
    ]
  }

  if (/arxiv/.test(blob)) {
    return [
      {
        toolName: 'arxiv_search',
        libAr: 'arXiv API',
        whyAr: 'بحث علمي مجاني',
        instructionAr: 'نفّذ arxiv_search.',
      },
    ]
  }

  // Drive / workspace MCP docs → native tools
  if (/drive|workspace|gmail|calendar/.test(blob)) {
    return [
      {
        toolName: 'drive_search_files',
        libAr: 'أدوات Google الأصلية',
        whyAr: 'المنتج يغطي Drive/Gmail دون MCP خارجي',
        instructionAr: 'استخدم drive_search_files / mail_search / أدوات التقويم المدمجة.',
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
