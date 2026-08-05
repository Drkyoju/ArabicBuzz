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
  /** Catalog honesty: package removed / not supported as listed. */
  unavailable?: boolean
}

export const MCP_CATALOG: McpCatalogItem[] = [
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
      'المفضّل للزحف: عيّن FIRECRAWL_API_KEY (يتصل MCP تلقائياً) أو الصق رابط Firecrawl MCP.',
    envKeys: ['FIRECRAWL_API_KEY', 'FIRECRAWL_MCP_URL'],
    docsUrl: 'https://github.com/mendableai/firecrawl-mcp-server',
    recommended: true,
  },
  {
    id: 'anybrowse',
    nameAr: 'تصفح الويب (Anybrowse)',
    nameEn: 'Anybrowse',
    descriptionAr:
      'يسحب صفحات السياسات والأنظمة ويستخرج نصاً نظيفاً — بديل اختياري عند غياب Firecrawl.',
    benefitsAr: 'بناء معرفة الجمعية من مواقع حكومية ولوائح دون لصق يدوي.',
    categoryAr: 'ويب وبحث',
    runtime: 'remote',
    transport: 'sse',
    defaultUrl: 'https://anybrowse.dev/mcp',
    setupHintAr:
      'غير موصى به كافتراضي — يُفضَّل Firecrawl عند توفر المفتاح. للاتصال اليدوي أو MCP_AUTO_ANYBROWSE=1.',
    docsUrl: 'https://github.com/kc23go/anybrowse',
    recommended: false,
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
      'لا stdio على Netlify. على الماك/VPS: node packages/ops-bridge/bin/ab-ops-bridge.mjs github ثم عيّن MCP_GITHUB_URL أو MCP_REMOTE_SERVERS. محلياً فقط: npx مع GITHUB_PERSONAL_ACCESS_TOKEN.',
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN', 'MCP_GITHUB_URL'],
    docsUrl: 'https://github.com/github/github-mcp-server',
    recommended: true,
  },
  {
    id: 'postgres',
    nameAr: 'PostgreSQL (MCP Toolbox)',
    nameEn: 'PostgreSQL via MCP Toolbox',
    descriptionAr:
      'استعلامات Postgres عبر MCP Toolbox (googleapis/mcp-toolbox) — الحزمة @modelcontextprotocol/server-postgres أُزيلت ولم تعد مدعومة.',
    benefitsAr: 'تقارير مخصصة وتشخيص الجداول عبر البديل المعتمد من Google.',
    categoryAr: 'بيانات',
    runtime: 'both',
    transport: 'sse',
    setupHintAr:
      'على Netlify: شغّل Toolbox كحاوية بعيدة (Streamable HTTP على /mcp) وعيّن MCP_TOOLBOX_URL — يتصل تلقائياً. محلياً: npx -y @toolbox-sdk/server --prebuilt=postgres --stdio مع DATABASE_URL/POSTGRES_*. لا تستخدم @modelcontextprotocol/server-postgres.',
    envKeys: [
      'MCP_TOOLBOX_URL',
      'DATABASE_URL',
      'POSTGRES_HOST',
      'POSTGRES_PORT',
      'POSTGRES_DATABASE',
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
    ],
    docsUrl: 'https://github.com/googleapis/mcp-toolbox',
    recommended: true,
  },
  {
    id: 'google-workspace',
    nameAr: 'Google Workspace (أصلي)',
    nameEn: 'Google Workspace native tools',
    descriptionAr:
      'Gmail و Sheets عبر OAuth الموجود في Arabic Buzz (gmail_search / gmail_read / gmail_send / sheets_read / sheets_write) — لا يحتاج حاوية MCP منفصلة.',
    benefitsAr: 'فرز البريد وإرساله وتحديث الجداول من الشات مع HITL على الإرسال والكتابة.',
    categoryAr: 'مساحة عمل',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'اربط Google من الإعدادات (يشمل gmail.readonly و gmail.send و spreadsheets). فعّل Gmail API و Google Sheets API في Google Cloud. من ربطوا سابقاً: أعد «ربط تقويم Google» لمنح gmail.send. اختياري: MCP بعيد مثل taylorwilsdon/google_workspace_mcp عبر MCP_REMOTE_SERVERS.',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    docsUrl: 'https://developers.google.com/workspace',
    recommended: true,
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
    descriptionAr:
      'بحث ويب منظم للوائح والأنظمة. على Netlify يُفعَّل عبر BRAVE_API_KEY في أداة web_search مباشرة (بدون stdio).',
    benefitsAr: 'نتائج أوضح من التصفح العشوائي للسياسات الحكومية.',
    categoryAr: 'ويب وبحث',
    runtime: 'both',
    transport: 'sse',
    setupHintAr:
      'عيّن BRAVE_API_KEY على Netlify (طبقة مجانية) — يُستخدم مباشرة في web_search. اختياري: BRAVE_MCP_URL لخادم MCP بعيد (HTTP/SSE فقط؛ لا stdio على Netlify).',
    envKeys: ['BRAVE_API_KEY', 'BRAVE_MCP_URL'],
    docsUrl: 'https://brave.com/search/api/',
    recommended: true,
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
    id: 'browser-use',
    nameAr: 'متصفح browser-use (ماك)',
    nameEn: 'browser-use',
    descriptionAr:
      'أتمتة بوابات حكومية عبر browser-use على جسر الماك (أو BROWSER_USE_URL) — يتطلب موافقة بشرية (HITL) عبر browser_rpa. Playwright احتياطي.',
    benefitsAr: 'وكيل متصفح أذكى للنماذج الحكومية مع إبقاء التحقق اليدوي.',
    categoryAr: 'أتمتة',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'على الماك: pip install browser-use && playwright install chromium، ثم npm run storage:sync. عيّن MAC_SYNC_URL أو BROWSER_USE_URL على Netlify. BROWSER_ENGINE=browser-use|playwright|auto.',
    envKeys: [
      'BROWSER_USE_URL',
      'BROWSER_USE_SECRET',
      'BROWSER_USE_SCRIPT',
      'MAC_SYNC_URL',
      'MAC_SYNC_SECRET',
      'BROWSER_ENGINE',
    ],
    docsUrl: 'https://github.com/browser-use/browser-use',
    recommended: true,
  },
  {
    id: 'playwright',
    nameAr: 'متصفح Playwright (ماك · احتياطي)',
    nameEn: 'Playwright (fallback)',
    descriptionAr:
      'احتياطي لتعبئة النماذج عبر جسر الماك إن لم يتوفر browser-use — HITL عبر browser_rpa.',
    benefitsAr: 'بديل محلي بسيط عند غياب Python/browser-use.',
    categoryAr: 'أتمتة',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'scripts/playwright-task.mjs على الماك مع npm i -D playwright. يُفضَّل browser-use كمحرك أساسي.',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    recommended: false,
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
      'يحوّل قرارات PDF طويلة/ممسوحة إلى Markdown — عبر جسر الماك (MAC_SYNC_URL) أو أداة read_decision_document. ليس خادماً عاماً على الإنترنت.',
    benefitsAr: 'قراءة أوضح للقرارات ثم إضافتها للمعرفة.',
    categoryAr: 'مستندات',
    runtime: 'both',
    transport: 'stdio',
    setupHintAr:
      'على الماك: pip install "markitdown[all]" + npm run storage:sync. Netlify: MAC_SYNC_URL (read_decision_document). اختياري MCP بعيد: MCP_MARKITDOWN_URL عبر packages/ops-bridge.',
    envKeys: ['MAC_SYNC_URL', 'MAC_SYNC_SECRET', 'MCP_MARKITDOWN_URL'],
    docsUrl: 'https://github.com/microsoft/markitdown',
    recommended: true,
  },
  {
    id: 'steel',
    nameAr: 'متصفح Steel (سحابة · احتياطي)',
    nameEn: 'Steel.dev cloud browser',
    descriptionAr:
      'جلسة متصفح سحابية احتياطية لـ browser_rpa عند غياب browser-use/جسر الماك — HITL مطلوب. لا يشغّل داخل Netlify مباشرة.',
    benefitsAr: 'Failover سحابي للبوابات الحكومية عند تعذّر الجسر المحلي.',
    categoryAr: 'أتمتة',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'عيّن STEEL_API_KEY على Netlify. الأولوية: BROWSER_USE_URL ثم MAC_SYNC_URL ثم Steel.',
    envKeys: ['STEEL_API_KEY', 'STEEL_API_URL'],
    docsUrl: 'https://github.com/steel-dev/steel-sdk',
    recommended: false,
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
