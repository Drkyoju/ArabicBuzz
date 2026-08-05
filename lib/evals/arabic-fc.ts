/**
 * Arabic function-calling eval (MSA) built on HeshamHaroon/Arabic_Function_Calling.
 *
 * Two things are measured with the dataset's own tool namespace — not the
 * Arabic Buzz tool namespace — so it stays a clean routing benchmark:
 *  • tool_selection      → picks the correct function for an MSA request
 *  • anti_hallucination  → abstains from calling any tool for chit-chat/knowledge
 *
 * Regenerate / expand the vendored subset with:
 *   npm run evals:fetch-arabic-fc -- --per-function 5 --negatives 30
 */

export const ARABIC_FC_DATASET_FILE = 'tests/evals/arabic-function-calling.json'

export type ArabicFcCategory = 'tool_selection' | 'anti_hallucination'

export type ArabicFcFunction = {
  name: string
  descriptionAr: string
  parameters: Record<string, 'string' | 'number' | 'boolean'>
}

export type ArabicFcItem = {
  id: string
  category: ArabicFcCategory
  promptAr: string
  /** null for abstention rows (requires_function=false upstream). */
  expectedFunction: string | null
  expectedArgs?: Record<string, unknown>
  domain?: string
  dialect?: string
}

export type ArabicFcDataset = {
  version: string
  name: string
  source: string
  sourceUrl: string
  licenseNoteAr: string
  dialectNoteAr: string
  generatedAt: string
  thresholds: {
    toolSelectionAccuracy: number
    abstentionAccuracy: number
  }
  functions: ArabicFcFunction[]
  items: ArabicFcItem[]
}

export type ArabicFcItemResult = {
  id: string
  category: ArabicFcCategory
  expected: string | null
  called: string | null
  passed: boolean
  argKeyRecall: number | null
  details: string
}

export const ARABIC_FC_SYSTEM_AR = [
  'أنت موجّه أدوات عربي. اقرأ طلب المستخدم بالفصحى واختر أداة واحدة مناسبة إن كان الطلب يحتاج تنفيذ عملية.',
  'إن كان الطلب مجرد سؤال معرفي عام أو تحية أو شكر أو سؤال عن قدراتك، فأجب نصاً بالعربية الفصحى ولا تستدعِ أي أداة.',
  'لا تستدعِ أكثر من أداة واحدة، ولا تختلق معاملات غير مذكورة في الطلب.',
].join(' ')

/** MSA descriptions for the upstream function namespace (dataset ships none). */
export const ARABIC_FC_FUNCTION_DESCRIPTIONS_AR: Record<string, string> = {
  get_weather: 'حالة الطقس المتوقعة لمدينة محددة لعدد من الأيام.',
  get_air_quality: 'مؤشر جودة الهواء الحالي لمدينة محددة.',
  get_prayer_times: 'مواقيت الصلاة ليوم محدد في مدينة محددة.',
  get_qibla_direction: 'اتجاه القبلة بالدرجات من مدينة أو إحداثيات.',
  calculate_zakat: 'حساب مبلغ الزكاة الواجب على مال أو أصول محددة.',
  search_quran: 'البحث في نص القرآن الكريم عن آية أو كلمة.',
  get_hadith: 'جلب حديث نبوي من كتاب أو باب محدد.',
  search_umrah_packages: 'البحث عن باقات عمرة حسب المدينة والتاريخ والميزانية.',
  book_government_appointment:
    'حجز موعد في خدمة حكومية (تجديد هوية، رخصة، جوازات…).',
  check_iqama_status: 'الاستعلام عن حالة الإقامة أو صلاحيتها برقم الإقامة.',
  check_visa_status: 'الاستعلام عن حالة تأشيرة برقم الطلب أو الجواز.',
  check_traffic_violations: 'الاستعلام عن المخالفات المرورية المسجلة على هوية أو مركبة.',
  calculate_customs: 'حساب الرسوم الجمركية المتوقعة على شحنة أو قيمة سلعة.',
  calculate_end_of_service: 'حساب مكافأة نهاية الخدمة حسب الراتب ومدة العمل.',
  book_doctor_appointment: 'حجز موعد طبي مع تخصص في مدينة وتاريخ محددين.',
  search_medications: 'البحث عن دواء وسعره وبدائله.',
  check_insurance_coverage: 'التحقق من تغطية التأمين الطبي لخدمة أو إجراء.',
  calculate_loan: 'حساب قسط تمويل أو قرض حسب المبلغ والمدة ونسبة الفائدة.',
  transfer_money: 'تحويل مبلغ مالي بين حسابين أو إلى مستفيد.',
  convert_currency: 'تحويل مبلغ من عملة إلى أخرى بسعر الصرف الحالي.',
  get_gold_price: 'سعر الذهب الحالي لعيار ووحدة محددة.',
  track_shipment: 'تتبع شحنة برقم التتبع لدى شركة التوصيل.',
  compare_prices: 'مقارنة أسعار منتج بين المتاجر الإلكترونية.',
  order_food: 'طلب وجبة من مطعم مع تحديد العناصر والعنوان.',
  search_flights: 'البحث عن رحلات طيران بين مدينتين في تاريخ محدد.',
  search_hotels: 'البحث عن فنادق في مدينة لتواريخ وميزانية محددة.',
  set_reminder: 'إنشاء تذكير بنص ووقت محددين.',
  translate_text: 'ترجمة نص بين لغتين.',
  calculate_math: 'حساب عملية رياضية أو تعبير حسابي.',
  get_current_time: 'الوقت الحالي في منطقة زمنية أو مدينة.',
}

export function scoreArabicFcItem(
  item: ArabicFcItem,
  calledFunctions: string[],
  calledArgs: Record<string, unknown> | null
): ArabicFcItemResult {
  const called = calledFunctions[0] ?? null
  if (item.category === 'anti_hallucination' || item.expectedFunction === null) {
    const passed = calledFunctions.length === 0
    return {
      id: item.id,
      category: 'anti_hallucination',
      expected: null,
      called,
      passed,
      argKeyRecall: null,
      details: passed
        ? 'abstained'
        : `called=${calledFunctions.join(',')} (expected no tool)`,
    }
  }

  const passed =
    calledFunctions.length === 1 && called === item.expectedFunction
  const expectedKeys = Object.keys(item.expectedArgs || {})
  const gotKeys = new Set(Object.keys(calledArgs || {}))
  const argKeyRecall =
    expectedKeys.length === 0
      ? null
      : expectedKeys.filter((k) => gotKeys.has(k)).length / expectedKeys.length

  return {
    id: item.id,
    category: 'tool_selection',
    expected: item.expectedFunction,
    called,
    passed,
    argKeyRecall,
    details: passed
      ? `ok argKeys=${argKeyRecall === null ? 'n/a' : argKeyRecall.toFixed(2)}`
      : `expected=${item.expectedFunction} called=${calledFunctions.join(',') || '∅'}`,
  }
}

export function aggregateArabicFc(results: ArabicFcItemResult[]) {
  const selection = results.filter((r) => r.category === 'tool_selection')
  const abstention = results.filter((r) => r.category === 'anti_hallucination')
  const recalls = selection
    .map((r) => r.argKeyRecall)
    .filter((v): v is number => typeof v === 'number')

  return {
    toolSelectionAccuracy:
      selection.length === 0
        ? 1
        : selection.filter((r) => r.passed).length / selection.length,
    abstentionAccuracy:
      abstention.length === 0
        ? 1
        : abstention.filter((r) => r.passed).length / abstention.length,
    argKeyRecall:
      recalls.length === 0
        ? 1
        : recalls.reduce((s, v) => s + v, 0) / recalls.length,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
  }
}
