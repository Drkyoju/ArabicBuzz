/**
 * Association-doc synonyms for Arabic knowledge retrieval.
 * Expands query tokens so BM25 / lexical fallback match common variants
 * (تأسيس ↔ ترخيص، لائحة ↔ نظام أساسي، …).
 */

/** Canonical term → related aliases (including the term itself when useful). */
const ASSOCIATION_SYNONYM_GROUPS: string[][] = [
  ['تأسيس', 'إنشاء', 'تسجيل', 'قيد'],
  ['ترخيص', 'رخصة', 'تصريح', 'اعتماد'],
  ['لائحة', 'نظام أساسي', 'نظام اساسى', 'لوائح', 'نظام داخلي'],
  ['خطاب', 'رسالة', 'مذكرة', 'كتاب رسمي', 'تعميم'],
  ['محضر', 'مضبطة', 'وقائع اجتماع', 'minutes'],
  ['ميزانية', 'موازنة', 'مالية', 'حسابات'],
  ['جمعية', 'مؤسسة', 'كيان غير ربحي', 'منظمة'],
  ['مجلس', 'مجلس الإدارة', 'مجلس الادارة', 'أعضاء المجلس'],
  ['لجنة', 'لجان', 'اللجنة المالية', 'لجنة البرامج'],
  ['اعتماد', 'اعتمادية', 'تجديد اعتماد', 'شهادة اعتماد'],
  ['نظام', 'سياسة', 'سياسات', 'إجراءات'],
  ['عقد', 'اتفاقية', 'مذكرة تفاهم', 'mou'],
  ['تقرير', 'تقارير', 'ملخص', 'إفادة'],
  ['أعضاء', 'عضوية', 'منتسبين', 'منسوبون'],
  ['اجتماع', 'جلسة', 'لقاء', 'ندوة'],
  ['قرار', 'قرارات', 'توصية', 'توصيات'],
  ['سجل', 'سجلات', 'أرشيف', 'ملف'],
  ['وزارة', 'الموارد البشرية', 'التنمية الاجتماعية', 'المركز الوطني'],
  ['جمعية عمومية', 'العمومية', 'اجتماع الجمعية العمومية', 'الجمعية العمومية'],
  ['متطوع', 'متطوعون', 'تطوع', 'العمل التطوعي'],
  ['مدقق', 'مراجع', 'مراجعة داخلية', 'تدقيق'],
  ['مدير تنفيذي', 'الرئيس التنفيذي', 'CEO', 'الإدارة التنفيذية'],
  ['تبرع', 'تبرعات', 'منحة', 'تمويل', 'إيراد'],
  ['حوكمة', 'امتثال', 'التزام', 'رقابة'],
  ['هوية وطنية', 'سجل تجاري', 'رقم عضوية', 'بيانات الأعضاء'],
  ['موعد نظامي', 'موعد امتثال', 'انتهاء ترخيص', 'تجديد رخصة'],
]

const LOOKUP = new Map<string, string[]>()

function seedLookup() {
  if (LOOKUP.size > 0) return
  for (const group of ASSOCIATION_SYNONYM_GROUPS) {
    const normalized = group.map((t) => t.normalize('NFC').trim()).filter(Boolean)
    for (const term of normalized) {
      const existing = LOOKUP.get(term) || []
      const merged = [...new Set([...existing, ...normalized])]
      LOOKUP.set(term, merged)
    }
  }
}

/** Tokenize Arabic query text (letters/numbers only). */
export function tokenizeArabicQuery(queryText: string): string[] {
  return queryText
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/**
 * Expand a free-form Arabic query with association-doc synonyms.
 * Returns unique tokens suitable for OR-style lexical matching and re-rank.
 */
export function expandArabicQueryTokens(queryText: string): string[] {
  seedLookup()
  const tokens = tokenizeArabicQuery(queryText)
  const out = new Set<string>()
  for (const t of tokens) {
    out.add(t)
    const aliases = LOOKUP.get(t)
    if (aliases) {
      for (const a of aliases) {
        // Keep multi-word aliases as a single phrase token for includes()
        out.add(a)
        for (const part of a.split(/\s+/)) {
          if (part.length >= 2) out.add(part)
        }
      }
    }
  }
  return [...out]
}

/**
 * Build an expanded query string for embedding / BM25.
 * Appends unique synonym tokens not already in the original query.
 */
export function expandArabicQueryText(queryText: string): string {
  const trimmed = queryText?.trim()
  if (!trimmed) return ''
  const original = new Set(tokenizeArabicQuery(trimmed).map((t) => t.toLowerCase()))
  const expanded = expandArabicQueryTokens(trimmed)
  const extras = expanded.filter((t) => !original.has(t.toLowerCase()) && !t.includes(' '))
  if (extras.length === 0) return trimmed
  // Cap extras so tsquery / embeddings stay focused
  return `${trimmed} ${extras.slice(0, 12).join(' ')}`
}
