/**
 * Excellent free toolkit checklist — capability parity targets.
 * ArabicBuzz (Telegram/site agents) and Hermes (WhatsApp) implement
 * these separately. Never couple runtimes or HTTP between them.
 */

export type FreeToolkitSide = 'bot' | 'hermes'

export type FreeToolkitItem = {
  /** Stable id for tests / docs */
  id: string
  /** Arabic label for help / parity tables */
  labelAr: string
  /** ArabicBuzz tool or feature name(s) */
  bot: string
  /** Hermes skill / MCP / script */
  hermes: string
  /** true when both sides have a working free path */
  bothReady: boolean
  /** Optional note (e.g. bot-only product features) */
  noteAr?: string
}

/** Target excellent free set (no Firecrawl/Brave/marker-pdf required). */
export const EXCELLENT_FREE_TOOLKIT: FreeToolkitItem[] = [
  {
    id: 'web_search',
    labelAr: 'بحث ويب (DuckDuckGo)',
    bot: 'web_search',
    hermes: 'MCP duckduckgo / مهارة duckduckgo-search',
    bothReady: true,
  },
  {
    id: 'web_fetch',
    labelAr: 'قراءة رابط (Jina/fetch)',
    bot: 'web_fetch / ingest_url_to_brain',
    hermes: 'MCP fetch / hermes-jina-fetch',
    bothReady: true,
  },
  {
    id: 'wikipedia',
    labelAr: 'ويكيبيديا',
    bot: 'wikipedia_lookup',
    hermes: 'MCP wikipedia',
    bothReady: true,
  },
  {
    id: 'youtube',
    labelAr: 'تفريغ يوتيوب',
    bot: 'youtube_transcript',
    hermes: 'MCP youtube-transcript',
    bothReady: true,
  },
  {
    id: 'math',
    labelAr: 'حساب رياضي',
    bot: 'math_eval',
    hermes: 'MCP math',
    bothReady: true,
  },
  {
    id: 'domain',
    labelAr: 'استعلام نطاق DNS/RDAP',
    bot: 'domain_intel',
    hermes: 'MCP dns / مهارة domain-intel',
    bothReady: true,
  },
  {
    id: 'arxiv',
    labelAr: 'بحث arXiv',
    bot: 'arxiv_search',
    hermes: 'MCP arxiv / مهارة arxiv',
    bothReady: true,
  },
  {
    id: 'fx',
    labelAr: 'سعر صرف (يشمل SAR)',
    bot: 'fx_rate',
    hermes: 'MCP public-apis (forex)',
    bothReady: true,
  },
  {
    id: 'geocode',
    labelAr: 'ترميز جغرافي',
    bot: 'geocode',
    hermes: 'MCP public-apis (geo) / مهارة maps',
    bothReady: true,
  },
  {
    id: 'dictionary',
    labelAr: 'قاموس إنجليزي',
    bot: 'dictionary_lookup',
    hermes: 'MCP public-apis (dictionary)',
    bothReady: true,
    noteAr: 'للعربية: ويكيبيديا على الجانبين',
  },
  {
    id: 'hn',
    labelAr: 'Hacker News',
    bot: 'hn_search',
    hermes: 'MCP duckduckgo / web search (site:news.ycombinator.com)',
    bothReady: true,
    noteAr: 'هيرميس عبر بحث ويب؛ البوت أداة مخصصة',
  },
  {
    id: 'saudi_datetime',
    labelAr: 'تاريخ/وقت السعودية + هجري',
    bot: 'saudi_datetime',
    hermes: 'MCP time + Intl / مهارة maps',
    bothReady: true,
    noteAr: 'توقيت Asia/Riyadh ميلادي+هجري محلياً بلا مفتاح',
  },
  {
    id: 'wayback',
    labelAr: 'أرشيف الويب (Wayback)',
    bot: 'wayback_lookup',
    hermes: 'MCP fetch → archive.org/wayback',
    bothReady: true,
    noteAr: 'لقطات مجانية لصفحات gov.sa/لوائح',
  },
  {
    id: 'drive_search',
    labelAr: 'بحث/قائمة Drive',
    bot: 'drive_search_files / drive_list_files',
    hermes: 'waqf-drive / hermes-wa-archive --search',
    bothReady: true,
    noteAr: 'مجلدات مختلفة (عقل الشركة ≠ الوقف)',
  },
  {
    id: 'storage_mesh',
    labelAr: 'شبكة تخزين (ملف مفقود)',
    bot: 'find_storage_mesh (Drive→TG→غرفة→ماك)',
    hermes: 'hermes-storage-mesh (Drive الوقف→كاش محلي)',
    bothReady: true,
  },
  {
    id: 'archive',
    labelAr: 'أرشفة وسائط → Drive',
    bot: 'archive_telegram_group',
    hermes: 'wa-archive / hermes-wa-archive',
    bothReady: true,
  },
  {
    id: 'pdf_read_ocr',
    labelAr: 'قراءة PDF/DOCX + OCR عربي',
    bot: 'read_document / arabic_ocr / convert_document',
    hermes: 'wa-file-read / hermes-file-read (tesseract ara+eng)',
    bothReady: true,
  },
  {
    id: 'pdf_dup',
    labelAr: 'نسخ صفحة PDF / صفحة فاضية',
    bot: 'pdf_duplicate_page',
    hermes: 'hermes-pdf-dup / مهارة wa-pdf-dup',
    bothReady: true,
  },
  {
    id: 'stt_ar',
    labelAr: 'تفريغ صوت عربي',
    bot: 'STT تيليجرام (مسار المنتج)',
    hermes: 'faster-whisper local (language=ar)',
    bothReady: true,
  },
  {
    id: 'help_ar',
    labelAr: 'مساعدة عربية للقدرات',
    bot: 'help-copy / /help',
    hermes: 'ar-help / SOUL.md',
    bothReady: true,
  },
  {
    id: 'memory',
    labelAr: 'ذاكرة محادثة تيليجرام (لكل شات)',
    bot: 'chat-memory (room_posts حسب chatId) + مهام/مرفقات',
    hermes: 'MCP memory',
    bothReady: true,
    noteAr: 'أنظمة منفصلة — ذاكرة TG لا تُشارك مع واتساب هيرميس',
  },
  {
    id: 'code_docs',
    labelAr: 'وثائق مكتبات (Context7)',
    bot: 'web_fetch + research (لا Context7 داخل CranL)',
    hermes: 'MCP context7 / مهارة code-wiki',
    bothReady: true,
    noteAr: 'البوت يعتمد الويب؛ هيرميس لديه Context7 محلياً',
  },
  {
    id: 'mail',
    labelAr: 'بريد',
    bot: 'mail_* / gmail_*',
    hermes: 'google-workspace (عند طلب صريح)',
    bothReady: true,
    noteAr: 'هيرميس: منشن فقط — لا سبام بريد',
  },
]

export function freeToolkitReadyIds(): string[] {
  return EXCELLENT_FREE_TOOLKIT.filter((i) => i.bothReady).map((i) => i.id)
}

export function freeToolkitParityTableAr(): string {
  const lines = [
    'قدرات مجانية متوازية (أنظمة منفصلة — بلا ربط تشغيل):',
    '| القدرة | بوت تيليجرام | هيرميس واتساب |',
    '|---|---|---|',
    ...EXCELLENT_FREE_TOOLKIT.map((i) => {
      const mark = i.bothReady ? '✓' : '—'
      return `| ${i.labelAr} | ${mark} ${i.bot} | ${mark} ${i.hermes} |`
    }),
    '',
    'هيرميس = واتساب فقط. @alhuda14bot = تيليجرام/الموقع. لا يتشاركان runtime ولا webhook.',
  ]
  return lines.join('\n')
}
