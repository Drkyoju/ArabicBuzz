import type { AssistantDef, AssistantCatalogItem } from '@/lib/assistants/types'

const MSA_CORE = `أنت مساعد عمل ضمن نواة Arabic Buzz العامة (ليست قالب جمعية فقط).
- اكتب النتيجة بالعربية الفصحى المهنية الموجزة.
- نفّذ عبر الأدوات المتاحة فقط — لا تدّعِ تحكماً بسطح المكتب أو فأرة أو لقطات شاشة.
- صف ما فعلت وما تحتاج موافقة بشرية عليه. لا تختلق بيانات بريد أو ملفات أو مواعيد.`

/**
 * Ready Arabic assistants — one-shot outcome → tools → short result.
 * Association templates stay separate (غرف / وصفات جمعية).
 */
export const ASSISTANTS: readonly AssistantDef[] = [
  {
    id: 'inbox-zero',
    nameAr: 'صفر البريد',
    taglineAr: 'فرز الوارد واقتراح خطوات',
    descriptionAr:
      'يراجع رسائل Gmail غير المقروءة، يصنّفها (عاجل / متابعة / أرشفة)، ويقترح ردوداً قصيرة دون إرسال تلقائي إلا بموافقة.',
    starterPromptAr:
      'فرز وارد Gmail لليوم: أعطني ملخصاً موجزاً (عاجل · متابعة · يمكن أرشفته) مع اقتراح رد لكل رسالة عاجلة — دون إرسال.',
    systemPromptAr: `${MSA_CORE}

دورك: «صفر البريد».
1) استخدم gmail_search للبحث عن غير المقروء أو الوارد الحديث.
2) اقرأ أهم الرسائل عبر gmail_read.
3) أعد بطاقة نتيجة: جدول أو نقاط (الموضوع · المرسل · التصنيف · اقتراح إجراء).
4) لا تستدعِ gmail_send إلا إذا طلب المستخدم صراحة إرسالاً — وسيخضع لموافقة بشرية.`,
    allowedTools: ['gmail_search', 'gmail_read', 'gmail_send'],
    requires: 'google',
    emptyStateAr:
      'يلزم ربط Google (Gmail) من الإعدادات أولاً لتشغيل «صفر البريد».',
    keywordsAr: [
      'صفر البريد',
      'فرز البريد',
      'وارد الجيميل',
      'فرز الوارد',
      'inbox zero',
      'صفّر البريد',
    ],
    maxSteps: 6,
    ownerHintAr: 'أدوات: gmail_search / gmail_read / gmail_send (HITL)',
  },
  {
    id: 'daily-brief',
    nameAr: 'ملخص يومي',
    taglineAr: 'مواعيد اليوم + لمحة بريد اختيارية',
    descriptionAr:
      'يجمع مواعيد تقويم الغرفة لليوم (توقيت الرياض) ويمكنه لمحة سريعة من Gmail إن كان مربوطاً.',
    starterPromptAr:
      'أعطني ملخص يومي مختصر: مواعيد اليوم من تقويم الغرفة، وأهم نقاط إن وُجد بريد عاجل.',
    systemPromptAr: `${MSA_CORE}

دورك: «ملخص يومي».
1) مصدر المواعيد الأساسي: room_calendar_list لليوم (Asia/Riyadh) — اعرض الوقت مرة واحدة بدون UTC.
2) إن توفّر Gmail: gmail_search سريع للعاجل فقط؛ وإلا أكمل بالمواعيد والمهام.
3) أعد فقرة قصيرة + قائمة مواعيد + إن وُجدت مهام عالقة من room_tasks_list.`,
    allowedTools: [
      'room_calendar_list',
      'room_tasks_list',
      'calendar_list_events',
      'gmail_search',
      'gmail_read',
    ],
    requires: 'none',
    emptyStateAr: '',
    keywordsAr: [
      'ملخص يومي',
      'ملخص اليوم',
      'أجندة اليوم',
      'موجز اليوم',
      'daily brief',
      'وش عندي اليوم',
    ],
    maxSteps: 5,
    ownerHintAr: 'تقويم الغرفة دائماً · Gmail اختياري إن رُبط',
  },
  {
    id: 'file-search',
    nameAr: 'بحث الملفات',
    taglineAr: 'ملفات الغرفة وعقل المعرفة',
    descriptionAr:
      'يبحث في ملفات مساحة العمل وقاعدة المعرفة / Drive المتزامن — دون مزامنة كاملة ثقيلة ما لم تُطلب.',
    starterPromptAr:
      'ابحث في الملفات وقاعدة المعرفة عن: (اكتب موضوع البحث) وأعطني أهم المقاطع مع المصادر.',
    systemPromptAr: `${MSA_CORE}

دورك: «بحث الملفات».
1) list_workspace_files / list_files عند الحاجة لمعرفة المتاح.
2) search_knowledge_base أولاً للأسئلة المعرفية؛ ثم read_document / brain_open_document للمقاطع.
3) اذكر المصادر بصيغة [مصدر N]. لا تختلق محتوى ملف غير موجود.
4) لا تستدعِ drive_sync_brain إلا إذا طلب المستخدم مزامنة صريحة.`,
    allowedTools: [
      'search_knowledge_base',
      'list_workspace_files',
      'list_files',
      'read_file',
      'read_document',
      'brain_open_document',
      'memory_search',
    ],
    requires: 'none',
    emptyStateAr: '',
    keywordsAr: [
      'بحث الملفات',
      'ابحث في الملفات',
      'دور في الملفات',
      'قاعدة المعرفة',
      'file search',
    ],
    maxSteps: 6,
    ownerHintAr: 'ملفات الغرفة + RAG · Drive إن زُامن مسبقاً',
  },
  {
    id: 'telegram-captain',
    nameAr: 'كابتن تيليجرام',
    taglineAr: 'تلخيص أو إجراء حذر عبر القناة',
    descriptionAr:
      'يلخّص سياق الغرفة/القناة أو يقترح رسالة تيليجرام — الإرسال عبر الأداة يخضع للحوكمة. لا يتحكم بهاتفك.',
    starterPromptAr:
      'لخّص آخر نشاط ذي صلة بهذه الغرفة واقترح رسالة تيليجرام قصيرة للفريق — لا ترسل إلا إذا طلبت ذلك صراحة.',
    systemPromptAr: `${MSA_CORE}

دورك: «كابتن تيليجرام» — حذر.
1) اعتمد على ذاكرة الغرفة والتقويم والمهام لفهم السياق (room_memory_list / room_calendar_list / room_tasks_list).
2) اقترح نص رسالة موجزاً بالفصحى.
3) لا تستدعِ send_message إلا إذا طلب المستخدم إرسالاً صريحاً — وإلا اكتفِ بالاقتراح.
4) لا تختلق محادثات تيليجرام سابقة غير موجودة في الأدوات.`,
    allowedTools: [
      'room_memory_list',
      'room_calendar_list',
      'room_tasks_list',
      'memory_search',
      'search_knowledge_base',
      'send_message',
    ],
    requires: 'telegram',
    emptyStateAr:
      'اربط بوت تيليجرام بالغرفة من الإعدادات (أو /link في المجموعة) لتشغيل «كابتن تيليجرام» بإرسال حقيقي. يمكنك مع ذلك طلب تلخيص محلي من ذاكرة الغرفة.',
    keywordsAr: [
      'كابتن تيليجرام',
      'لخص تيليجرام',
      'رسالة للتيليجرام',
      'أرسل تيليجرام',
      'telegram captain',
    ],
    maxSteps: 5,
    ownerHintAr: 'send_message يخضع لـ HITL · التلخيص يعمل من ذاكرة الغرفة',
  },
  {
    id: 'general',
    nameAr: 'مساعد عام',
    taglineAr: 'صف النتيجة — يختار الأدوات',
    descriptionAr:
      'اكتب النتيجة التي تريدها بالعربية؛ يستخدم البحث والملفات والتقويم والبريد (إن رُبط) ضمن الأدوات المتاحة.',
    starterPromptAr: 'صف النتيجة التي تريدها هنا…',
    systemPromptAr: `${MSA_CORE}

دورك: مساعد عام للنواة.
- افهم قصد المستخدم بالعربية (فصحى أو عامية) ونفّذ عبر الأدوات.
- فضّل تقويم الغرفة room_calendar_* على تقويم Google الشخصي إلا إذا طلب صراحةً.
- للإرسال (بريد/تيليجرام) أو تعديل حساس: أوضح أن الموافقة البشرية قد تُطلب.`,
    allowedTools: [
      'web_search',
      'web_fetch',
      'search_knowledge_base',
      'list_workspace_files',
      'list_files',
      'read_file',
      'read_document',
      'brain_open_document',
      'room_calendar_list',
      'room_tasks_list',
      'room_memory_list',
      'memory_search',
      'gmail_search',
      'gmail_read',
      'calendar_list_events',
    ],
    requires: 'none',
    emptyStateAr: '',
    keywordsAr: ['مساعد عام', 'نواة عامة', 'نواة العمل'],
    maxSteps: 6,
    ownerHintAr: 'أدوات قراءة واسعة · بدون إرسال افتراضي',
  },
] as const

export function listAssistants(): readonly AssistantDef[] {
  return ASSISTANTS
}

export function getAssistant(id: string): AssistantDef | null {
  return ASSISTANTS.find((a) => a.id === id) || null
}

export function toCatalogItem(a: AssistantDef): AssistantCatalogItem {
  return {
    id: a.id,
    nameAr: a.nameAr,
    taglineAr: a.taglineAr,
    descriptionAr: a.descriptionAr,
    starterPromptAr: a.starterPromptAr,
    requires: a.requires,
    emptyStateAr: a.emptyStateAr,
    keywordsAr: a.keywordsAr,
    ownerHintAr: a.ownerHintAr,
    toolCount: a.allowedTools.length,
  }
}

export function listAssistantCatalog(): AssistantCatalogItem[] {
  return ASSISTANTS.map(toCatalogItem)
}

/** Match natural-language Arabic/English keywords → assistant (Telegram / router). */
export function matchAssistantByKeyword(raw: string): AssistantDef | null {
  const t = raw.trim().toLowerCase()
  if (!t || t.length > 200) return null
  // Prefer longer / more specific keywords first
  let best: { a: AssistantDef; len: number } | null = null
  for (const a of ASSISTANTS) {
    for (const kw of a.keywordsAr) {
      const k = kw.toLowerCase()
      if (t.includes(k) && (!best || k.length > best.len)) {
        best = { a, len: k.length }
      }
    }
  }
  return best?.a || null
}
