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
    nameAr: 'زحف مواقع (Firecrawl) — اختياري',
    nameEn: 'Firecrawl (optional upgrade)',
    descriptionAr:
      'ترقية اختيارية للزحف. المسار المجاني المدمج: Jina Reader + جلب مباشر عبر ingest_url_to_brain بدون مفتاح.',
    benefitsAr: 'جودة أعلى لبعض المواقع الصعبة — ليس مطلوباً للعمل اليومي.',
    categoryAr: 'ويب وبحث',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'اختياري بمفتاح: FIRECRAWL_API_KEY أو FIRECRAWL_MCP_URL. بدون مفتاح يعمل السحب عبر Jina Reader / جلب مباشر (مجاني مدمج).',
    envKeys: ['FIRECRAWL_API_KEY', 'FIRECRAWL_MCP_URL'],
    docsUrl: 'https://github.com/mendableai/firecrawl-mcp-server',
    recommended: false,
  },
  {
    id: 'anybrowse',
    nameAr: 'تصفح الويب (Anybrowse)',
    nameEn: 'Anybrowse',
    descriptionAr:
      'بديل اختياري إضافي — المسار الافتراضي المجاني هو Jina Reader ثم الجلب المباشر.',
    benefitsAr: 'بناء معرفة الجمعية من مواقع حكومية ولوائح دون لصق يدوي.',
    categoryAr: 'ويب وبحث',
    runtime: 'remote',
    transport: 'sse',
    defaultUrl: 'https://anybrowse.dev/mcp',
    setupHintAr:
      'غير موصى به كافتراضي. للاتصال اليدوي أو MCP_AUTO_ANYBROWSE=1 فقط.',
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
      'لا stdio على CranL. على الماك/VPS: node packages/ops-bridge/bin/ab-ops-bridge.mjs github ثم عيّن MCP_GITHUB_URL أو MCP_REMOTE_SERVERS. محلياً فقط: npx مع GITHUB_PERSONAL_ACCESS_TOKEN.',
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
      'على CranL: شغّل Toolbox كحاوية بعيدة (Streamable HTTP على /mcp) وعيّن MCP_TOOLBOX_URL — يتصل تلقائياً. محلياً: npx -y @toolbox-sdk/server --prebuilt=postgres --stdio مع DATABASE_URL/POSTGRES_*. لا تستخدم @modelcontextprotocol/server-postgres.',
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
      'اربط Google من تقويم الفريق → «Google / Gmail» (يشمل gmail.readonly و gmail.send و spreadsheets). فعّل Gmail API و Google Sheets API في Google Cloud. من ربطوا سابقاً: أعد «ربط بريد Google (Gmail)» لمنح gmail.send. اختياري: MCP بعيد مثل taylorwilsdon/google_workspace_mcp عبر MCP_REMOTE_SERVERS.',
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
    setupHintAr: 'محلي فقط عبر وكيل الماك / stdio — غير متاح داخل حاوية CranL مباشرة.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'duckduckgo',
    nameAr: 'بحث DuckDuckGo (مجاني)',
    nameEn: 'DuckDuckGo (free, no key)',
    descriptionAr:
      'بحث ويب بلا مفتاح عبر MCP محلي — مكمّل لمسار web_search المدمج (DDG + ويكيبيديا + gov.sa).',
    benefitsAr: 'طبقة بحث مجانية للوكيل المحلي/Cursor/Hermes دون Brave أو Firecrawl.',
    categoryAr: 'ويب وبحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'مضمّن في .cursor/mcp.json و~/.hermes/config.yaml: npx -y @ericthered926/duckduckgo-mcp-server. المنتج على CranL يستخدم web_search المدمج مباشرة.',
    docsUrl: 'https://www.npmjs.com/package/@ericthered926/duckduckgo-mcp-server',
    recommended: true,
  },
  {
    id: 'wikipedia',
    nameAr: 'ويكيبيديا (مجاني)',
    nameEn: 'Wikipedia (free)',
    descriptionAr: 'ملخصات ويكيبيديا بلا مفتاح — مكمّل لـ wikipedia_lookup المدمج في المنتج.',
    benefitsAr: 'توضيح موسوعي سريع لـ Cursor/Hermes؛ على CranL استخدم wikipedia_lookup.',
    categoryAr: 'ويب وبحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'npx -y @shelm/wikipedia-mcp-server (في .cursor/mcp.json و~/.hermes). تجنّب حزمة mcp-server-wikipedia المعطوبة.',
    docsUrl: 'https://www.npmjs.com/package/@shelm/wikipedia-mcp-server',
    recommended: true,
  },
  {
    id: 'math',
    nameAr: 'رياضيات (مجاني)',
    nameEn: 'Math (free)',
    descriptionAr: 'تقييم تعبيرات رياضية — مكمّل لـ math_eval المدمج.',
    benefitsAr: 'حساب سريع بلا مفتاح.',
    categoryAr: 'أدوات',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx -y math-mcp · المنتج: math_eval',
    docsUrl: 'https://www.npmjs.com/package/math-mcp',
    recommended: true,
  },
  {
    id: 'youtube-transcript',
    nameAr: 'تفريغ يوتيوب (مجاني)',
    nameEn: 'YouTube transcript (free)',
    descriptionAr: 'كابشن/ترجمة يوتيوب بلا مفتاح — مكمّل لـ youtube_transcript المدمج.',
    benefitsAr: 'تلخيص فيديوهات من الكابشن المتاح.',
    categoryAr: 'وسائط',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'npx -y @sinco-lab/mcp-youtube-transcript (ليس youtube-transcript-mcp الذي يحتاج bun).',
    docsUrl: 'https://www.npmjs.com/package/@sinco-lab/mcp-youtube-transcript',
    recommended: true,
  },
  {
    id: 'dns',
    nameAr: 'DNS / نطاق (مجاني)',
    nameEn: 'DNS / domain (free)',
    descriptionAr: 'استعلامات DNS وWHOIS خفيفة — مكمّل لـ domain_intel المدمج.',
    benefitsAr: 'فحص نطاق بلا مفتاح مدفوع.',
    categoryAr: 'ويب وبحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx -y mcp-server-dns · المنتج: domain_intel (dns.google + RDAP)',
    docsUrl: 'https://www.npmjs.com/package/mcp-server-dns',
    recommended: true,
  },
  {
    id: 'arxiv',
    nameAr: 'arXiv (مجاني)',
    nameEn: 'arXiv (free)',
    descriptionAr: 'بحث أوراق علمية — مكمّل لـ arxiv_search المدمج.',
    benefitsAr: 'مراجع أكاديمية بلا مفتاح.',
    categoryAr: 'بحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx -y @fre4x/arxiv · المنتج: arxiv_search',
    docsUrl: 'https://www.npmjs.com/package/@fre4x/arxiv',
    recommended: true,
  },
  {
    id: 'public-apis',
    nameAr: 'واجهات عامة مجانية',
    nameEn: 'Public APIs (free bundle)',
    descriptionAr:
      'حزمة MCP بلا مفتاح: طقس/جغرافيا/صرف/قاموس/كتب/… — لهيرميس وCursor. المنتج على CranL له أدوات أصلية منفصلة (fx_rate/geocode/…).',
    benefitsAr: 'توسيع مجاني لهيرميس المحلي دون ربطه بالبوت.',
    categoryAr: 'ويب وبحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx -y mcp-public-apis في ~/.hermes و.cursor/mcp.json',
    docsUrl: 'https://www.npmjs.com/package/mcp-public-apis',
    recommended: true,
  },
  {
    id: 'brave-search',
    nameAr: 'بحث Brave — اختياري',
    nameEn: 'Brave Search (optional upgrade)',
    descriptionAr:
      'ترقية اختيارية. المسار المجاني المدمج في web_search: DuckDuckGo + ويكيبيديا + نتائج site:gov.sa بدون مفتاح.',
    benefitsAr: 'نتائج JSON أوضح إن وُجد مفتاح طبقة مجانية — ليس مطلوباً.',
    categoryAr: 'ويب وبحث',
    runtime: 'both',
    transport: 'sse',
    setupHintAr:
      'اختياري بمفتاح: BRAVE_API_KEY (طبقة مجانية من api-dashboard.search.brave.com) أو BRAVE_MCP_URL. بدون مفتاح يعمل البحث المدمج مجاناً.',
    envKeys: ['BRAVE_API_KEY', 'BRAVE_MCP_URL'],
    docsUrl: 'https://brave.com/search/api/',
    recommended: false,
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
      'على الماك: pip install browser-use && playwright install chromium، ثم npm run storage:sync. عيّن MAC_SYNC_URL أو BROWSER_USE_URL على CranL. BROWSER_ENGINE=browser-use|playwright|auto.',
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
    id: 'cua-driver',
    nameAr: 'جسر Cua (متصفح/سطح مكتب)',
    nameEn: 'Cua Driver',
    descriptionAr:
      'تحكم اختياري بالمتصفح وسطح المكتب عبر trycua/cua على جهازك — أداة cua_computer. لا يعمل داخل حاوية CranL؛ يحتاج cua-driver serve + npm run cua:bridge + نفق. HITL لإجراءات الإدخال.',
    benefitsAr:
      'صفحة واعية بدون امتداد كروم + خلفية سطح مكتب عند اتصال الجسر المحلي.',
    categoryAr: 'أتمتة',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'ثبّت من cua.ai/cua-driver ثم: cua-driver serve && npm run cua:bridge. Netlify: CUA_BRIDGE_URL + CUA_BRIDGE_SECRET. الدليل: docs/cua-bridge.md',
    envKeys: [
      'CUA_BRIDGE_URL',
      'CUA_BRIDGE_SECRET',
      'CUA_BRIDGE_PORT',
      'CUA_DRIVER_BIN',
      'CUA_DRIVER_SOCKET',
    ],
    docsUrl: 'https://github.com/trycua/cua',
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
      'جلسة متصفح سحابية احتياطية لـ browser_rpa عند غياب browser-use/جسر الماك — HITL مطلوب. لا يشغّل داخل حاوية CranL مباشرة.',
    benefitsAr: 'Failover سحابي للبوابات الحكومية عند تعذّر الجسر المحلي.',
    categoryAr: 'أتمتة',
    runtime: 'remote',
    transport: 'sse',
    setupHintAr:
      'عيّن STEEL_API_KEY على CranL. الأولوية: BROWSER_USE_URL ثم MAC_SYNC_URL ثم Steel.',
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
  {
    id: 'fetch',
    nameAr: 'جلب صفحات (Fetch)',
    nameEn: 'Fetch',
    descriptionAr:
      'جلب محتوى HTTP/HTML كأدوات MCP — مكمّل لمسار Jina Reader المدمج في web_fetch.',
    benefitsAr: 'قراءة صفحات عامة من وكيل Cursor أو جسر الماك.',
    categoryAr: 'ويب وبحث',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'محلي/Cursor: مضمّن في .cursor/mcp.json. للجسر: node packages/ops-bridge/bin/ab-ops-bridge.mjs fetch',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
    recommended: true,
  },
  {
    id: 'git',
    nameAr: 'Git محلي',
    nameEn: 'Git',
    descriptionAr: 'قراءة حالة المستودع والفروع والفروق عبر MCP.',
    benefitsAr: 'تشخيص التغييرات والمراجعات من داخل Cursor دون لصق يدوي.',
    categoryAr: 'تطوير',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'مضمّن في .cursor/mcp.json للمستودع الحالي.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
    recommended: true,
  },
  {
    id: 'google-workspace-mcp',
    nameAr: 'Google Workspace MCP (اختياري)',
    nameEn: 'taylorwilsdon/google_workspace_mcp',
    descriptionAr:
      'خادم مفتوح المصدر شامل (Gmail/Drive/Calendar/Docs…). المنتج يستخدم أدوات Google الأصلية أولاً — هذا بديل بعيد اختياري.',
    benefitsAr: 'تغطية أوسع لخدمات Google إن رغبت بتشغيل خادم MCP منفصل.',
    categoryAr: 'مساحة عمل',
    runtime: 'both',
    transport: 'sse',
    setupHintAr:
      'شغّل الخادم محلياً أو على VPS ببيانات OAuth الخاصة بكم، ثم عيّن الرابط في MCP_REMOTE_SERVERS. لا تستبدل الربط الأصلي في الواجهة إلا بعد اختبار HITL.',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'MCP_GOOGLE_WORKSPACE_URL'],
    docsUrl: 'https://github.com/taylorwilsdon/google_workspace_mcp',
    recommended: false,
  },
  {
    id: 'telegram-mcp',
    nameAr: 'Telegram MCP (ماك · اختياري)',
    nameEn: 'chigwell/telegram-mcp',
    descriptionAr:
      'وصول متقدم لمحادثات تيليجرام عبر Telethon — منفصل عن بوت الغرفة المدمج. للاستخدام المحلي/Cursor فقط.',
    benefitsAr: 'قراءة أرشيف القنوات الخاصة على الماك عند الحاجة التشغيلية.',
    categoryAr: 'تواصل',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'يتطلب API_ID/API_HASH من my.telegram.org. المنتج اليومي يبقى على بوت Arabic Buzz الأصلي.',
    envKeys: ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION'],
    docsUrl: 'https://github.com/chigwell/telegram-mcp',
    recommended: false,
  },
  {
    id: 'time',
    nameAr: 'الوقت والمناطق الزمنية',
    nameEn: 'Time',
    descriptionAr: 'تحويل المناطق الزمنية والتواريخ — مفيد مع تقويم الرياض.',
    benefitsAr: 'تقليل أخطاء التوقيت عند جدولة الاجتماعات عبر Cursor.',
    categoryAr: 'تخطيط',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr: 'npx -y @modelcontextprotocol/server-time',
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'imap',
    nameAr: 'بريد IMAP (Cursor / ماك)',
    nameEn: 'IMAP (local Cursor)',
    descriptionAr:
      'قراءة صناديق بريد عامة عبر IMAP على الجهاز المحلي — مكمّل لأدوات Gmail الأصلية في المنتج، وليس بديلاً عنها على CranL.',
    benefitsAr: 'تشخيص بريد الجمعية من Cursor عند الحاجة لـ IMAP/App Password.',
    categoryAr: 'مساحة عمل',
    runtime: 'local',
    transport: 'stdio',
    setupHintAr:
      'محلي فقط في .cursor/mcp.json (@aiwerk/mcp-server-imap). عيّن IMAP_HOST / IMAP_USER / IMAP_PASS (App Password). الإرسال معطّل افتراضياً (SMTP_SEND_ENABLED=false). لا stdio داخل دوال Netlify — المنتج يعتمد Gmail OAuth المدمج.',
    envKeys: ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS', 'SMTP_SEND_ENABLED'],
    docsUrl: 'https://github.com/aiwerk/mcp-server-imap',
    recommended: false,
  },
]

export function getMcpCatalogItem(id: string) {
  return MCP_CATALOG.find((c) => c.id === id)
}

export function mcpCatalogForNetlify() {
  return MCP_CATALOG.filter((c) => c.runtime === 'remote' || c.runtime === 'both')
}
