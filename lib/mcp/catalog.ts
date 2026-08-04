/**
 * Arabic MCP catalog — tools agents can use beyond the built-in suite.
 * Netlify supports remote SSE/HTTP only; stdio is for Mac/local.
 */

export type McpCatalogItem = {
  id: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  benefitsAr: string
  categoryAr: string
  /** Where it can run */
  runtime: 'remote' | 'local' | 'both'
  transport: 'sse' | 'stdio'
  /** Public default URL if free/remote (user can override) */
  defaultUrl?: string
  /** Hint for stdio / setup */
  setupHintAr: string
  envKeys?: string[]
  docsUrl?: string
  recommended?: boolean
}

export const MCP_CATALOG: McpCatalogItem[] = [
  {
    id: 'anybrowse',
    nameAr: 'تصفح الويب (Anybrowse)',
    nameEn: 'Anybrowse',
    descriptionAr:
      'يسحب صفحات السياسات والأنظمة ويستخرج نصاً نظيفاً — ثم يُفضّل ingest_url_to_brain للمعرفة.',
    benefitsAr: 'بناء معرفة الجمعية من مواقع حكومية ولوائح دون لصق يدوي.',
    categoryAr: 'ويب وبحث',
    runtime: 'remote',
    transport: 'sse',
    defaultUrl: 'https://anybrowse.dev/mcp',
    setupHintAr: 'يتصل تلقائياً مجاناً (حد يومي) — أو عطّل بـ MCP_AUTO_DEFAULTS=0.',
    docsUrl: 'https://github.com/kc23go/anybrowse',
    recommended: true,
  },
  {
    id: 'context7',
    nameAr: 'وثائق المكتبات (Context7)',
    nameEn: 'Context7',
    descriptionAr:
      'وثائق أحدث للمطوّرين (Next.js / AI SDK). أقل فائدة يومية للجمعية — مفيد عند ضبط المنصة.',
    benefitsAr: 'تقليل أخطاء الإعداد والكود عند تطوير التكاملات.',
    categoryAr: 'تطوير',
    runtime: 'remote',
    transport: 'sse',
    defaultUrl: 'https://mcp.context7.com/mcp',
    setupHintAr: 'يتصل تلقائياً — قد يلزم مفتاح Context7 حسب الخطة.',
    docsUrl: 'https://github.com/upstash/context7',
    recommended: true,
  },
  {
    id: 'supabase',
    nameAr: 'قاعدة Supabase',
    nameEn: 'Supabase',
    descriptionAr:
      'استعلامات على جداول الغرف والأعضاء والحضور. للتقارير السريعة استخدم أيضاً report_room_attendance.',
    benefitsAr: 'تقارير أعضاء/نشاط من قاعدتكم دون فتح لوحة قاعدة البيانات.',
    categoryAr: 'بيانات',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'الصق رابط SSE من لوحة Supabase أو عيّن SUPABASE_MCP_URL / MCP_REMOTE_SERVERS.',
    envKeys: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_MCP_URL'],
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
    recommended: true,
  },
  {
    id: 'github',
    nameAr: 'GitHub',
    nameEn: 'GitHub',
    descriptionAr: 'قراءة المستودعات والمسائل وطلبات الدمج وإجراءات CI.',
    benefitsAr: 'متابعة أعطال النشر والمساهمات من داخل الغرفة.',
    categoryAr: 'تطوير',
    runtime: 'both',
    transport: 'stdio',
    setupHintAr:
      'محلياً: npx مع GITHUB_PERSONAL_ACCESS_TOKEN. على Netlify استخدم خادماً بعيداً أو جسر الماك.',
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    docsUrl: 'https://github.com/github/github-mcp-server',
    recommended: true,
  },
  {
    id: 'postgres',
    nameAr: 'PostgreSQL',
    nameEn: 'PostgreSQL',
    descriptionAr: 'استعلامات قراءة/إدارة على قاعدة Postgres (نفس بيانات الجمعية).',
    benefitsAr: 'تقارير مخصصة وتشخيص الجداول.',
    categoryAr: 'بيانات',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'شغّل على الماك: npx -y @modelcontextprotocol/server-postgres $DATABASE_URL',
    envKeys: ['DATABASE_URL'],
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'filesystem',
    nameAr: 'ملفات الجهاز',
    nameEn: 'Filesystem',
    descriptionAr: 'قراءة وكتابة مجلدات محلية على الماك المرتبط.',
    benefitsAr: 'يربط عقل الشركة المحلي بمسارات المجلدات.',
    categoryAr: 'ملفات',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'محلي فقط عبر وكيل الماك / stdio — غير متاح داخل Netlify مباشرة.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'brave-search',
    nameAr: 'بحث Brave',
    nameEn: 'Brave Search',
    descriptionAr: 'بحث ويب منظم بنتائج واضحة مع مقتطفات.',
    benefitsAr: 'بديلاً أدق من التصفح العشوائي عند توفر المفتاح المجاني.',
    categoryAr: 'ويب وبحث',
    runtime: 'both',
    transport: 'stdio',
    setupHintAr: 'يتطلب BRAVE_API_KEY (طبقة مجانية) وتشغيل الخادم محلياً أو بعيداً.',
    envKeys: ['BRAVE_API_KEY'],
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'memory-kg',
    nameAr: 'ذاكرة معرفية',
    nameEn: 'Knowledge Graph Memory',
    descriptionAr: 'يحفظ حقائق طويلة الأمد كرسم معرفة بين الجلسات.',
    benefitsAr: 'يكمل ذاكرة الغرفة المشتركة بسياق أدق للكيانات.',
    categoryAr: 'ذاكرة',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'خادم Anthropic المرجعي — شغّله على الماك واربطه عبر URL بعيد إن وُجد.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'sequential-thinking',
    nameAr: 'تفكير متسلسل',
    nameEn: 'Sequential Thinking',
    descriptionAr: 'يساعد الوكيل على تقسيم المهام المعقدة إلى خطوات مرتبة.',
    benefitsAr: 'قرارات أوضح في الحوكمة والمهام متعددة الأطراف.',
    categoryAr: 'تخطيط',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'مرجع Anthropic — مناسب للتشغيل المحلي أو جسر الماك.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'playwright',
    nameAr: 'متصفح Playwright (ماك)',
    nameEn: 'Playwright',
    descriptionAr:
      'تعبئة بوابات حكومية متكررة عبر جسر الماك — يتطلب موافقة بشرية (HITL) عبر browser_rpa.',
    benefitsAr: 'يوفر وقت النماذج المتكررة مع إبقاء التحقق اليدوي للخطوات الحساسة.',
    categoryAr: 'أتمتة',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'شغّل npm run storage:sync على الماك وثبّت Playwright. MAC_SYNC_URL على Netlify. لا تستخدم بدون مراجعة.',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    recommended: true,
  },
  {
    id: 'slack',
    nameAr: 'Slack',
    nameEn: 'Slack',
    descriptionAr: 'إرسال وقراءة رسائل قنوات Slack للفريق.',
    benefitsAr: 'إشعارات خارج تيليجرام إن كان الفريق على Slack.',
    categoryAr: 'تواصل',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr: 'الصق رابط MCP الخاص بـ Slack (SSE) بعد تفعيل التطبيق.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'markitdown',
    nameAr: 'تحويل مستندات (MarkItDown)',
    nameEn: 'MarkItDown',
    descriptionAr:
      'يحوّل قرارات PDF طويلة/ممسوحة إلى Markdown — عبر جسر الماك أو read_decision_document.',
    benefitsAr: 'قراءة أوضح للقرارات ثم إضافتها للمعرفة.',
    categoryAr: 'مستندات',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'على الماك: pip install "markitdown[all]" ثم POST /markitdown عبر وكيل المزامنة.',
    docsUrl: 'https://github.com/microsoft/markitdown',
    recommended: true,
  },
  {
    id: 'firecrawl',
    nameAr: 'زحف مواقع (Firecrawl)',
    nameEn: 'Firecrawl',
    descriptionAr:
      'يستخرج صفحات السياسات كـ Markdown للـ RAG — يتكامل مع ingest_url_to_brain عند FIRECRAWL_API_KEY.',
    benefitsAr: 'بناء معرفة الجمعية من مواقع اللوائح والأنظمة.',
    categoryAr: 'ويب وبحث',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'عيّن FIRECRAWL_API_KEY (يتصل MCP تلقائياً) أو الصق رابط Firecrawl MCP.',
    envKeys: ['FIRECRAWL_API_KEY', 'FIRECRAWL_MCP_URL'],
    docsUrl: 'https://github.com/mendableai/firecrawl-mcp-server',
    recommended: true,
  },
  {
    id: 'sqlite',
    nameAr: 'SQLite',
    nameEn: 'SQLite',
    descriptionAr: 'قاعدة ملفات خفيفة للتجارب المحلية.',
    benefitsAr: 'نماذج أولية سريعة دون Postgres.',
    categoryAr: 'بيانات',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx mcp-server-sqlite --db-path ./data.db على الماك.',
  },
]

export function getMcpCatalogItem(id: string) {
  return MCP_CATALOG.find((c) => c.id === id)
}

export function mcpCatalogForNetlify() {
  return MCP_CATALOG.filter((c) => c.runtime === 'remote' || c.runtime === 'both')
}
