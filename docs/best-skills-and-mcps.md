# قائمة Skills & MCP الموصى بها لـ ArabicBuzz

تقرير عملي (أغسطس 2026) — مصادر: [skills.sh](https://skills.sh/)، [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)، [anthropics/skills](https://github.com/anthropics/skills)، كتالوج MCP في `lib/mcp/catalog.ts`، و`.cursor/mcp.json`.

التحقق الحي للمنتج: https://arabicbuzz-fooc9h.cranl.net/

---

## Skills الموصى بها (مرتبة)

| الاسم | ليش مفيدة لـ ArabicBuzz | رابط | مثبت؟ | أولوية |
|-------|-------------------------|------|-------|--------|
| **agent-browser** | أتمتة متصفح للبوابات الحكومية / QA (~643K) | [skills.sh](https://skills.sh/vercel-labs/agent-browser/agent-browser) · [GitHub](https://github.com/vercel-labs/agent-browser) | **نعم** (موجة 6) | P0 |
| **vercel-react-best-practices** | أداء Next.js/React — أساس المنتج | [skills.sh](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) · [GitHub](https://github.com/vercel-labs/agent-skills) | نعم | P0 (موجود) |
| **ai-sdk** | وكلاء الغرف / streaming / أدوات AI SDK | [skills.sh](https://skills.sh/vercel/ai/ai-sdk) · [GitHub](https://github.com/vercel/ai) | نعم | P0 (موجود) |
| **gws-gmail** | بريد الجمعية من Cursor (~69K) | [skills.sh](https://skills.sh/googleworkspace/cli/gws-gmail) · [GitHub](https://github.com/googleworkspace/cli) | **نعم** (موجة 6) | P0 |
| **gws-calendar** | مواعيد واجتماعات (~51K) | [skills.sh](https://skills.sh/googleworkspace/cli/gws-calendar) | **نعم** (موجة 6) | P0 |
| **gws-drive** | تنظيم Drive (~64K) | [skills.sh](https://skills.sh/googleworkspace/cli/gws-drive) | **نعم** (موجة 6) | P0 |
| **pdf / docx / xlsx / pptx** | تحويل وملفات المكتب (Anthropic) | [pdf](https://skills.sh/anthropics/skills/pdf) · [docx](https://skills.sh/anthropics/skills/docx) · [xlsx](https://skills.sh/anthropics/skills/xlsx) · [pptx](https://skills.sh/anthropics/skills/pptx) · [repo](https://github.com/anthropics/skills) | نعم (+pptx جديد) | P0 |
| **supabase** + **supabase-postgres-best-practices** | Postgres/RLS/فهارس | [supabase](https://skills.sh/supabase/agent-skills/supabase) · [repo](https://github.com/supabase/agent-skills) | نعم | P0 (موجود) |
| **mcp-builder** | بناء MCP مخصص للجمعية (~99K) | [skills.sh](https://skills.sh/anthropics/skills/mcp-builder) | **نعم** (موجة 6) | P1 |
| **ux-writing-arabic** | نصوص MSA في الواجهة | [skills.sh](https://skills.sh/itady74/ux-writing-arabic/ux-writing-arabic) | نعم | P1 (موجود) |
| **arabic-presentations** | عروض RTL عربية | [skills.sh](https://skills.sh/sultanalsafran/agent-skills/arabic-presentations) | نعم | P1 (موجود) |
| **playwright-core** | اختبارات E2E ضد CranL | [TestDino](https://github.com/testdino-hq/playwright-skill) | نعم | P1 (موجود) |
| **security-review** / **security-and-hardening** | مراجعة أمنية قبل الدفع | [Sentry](https://skills.sh/getsentry/skills/security-review) · [addyosmani](https://skills.sh/addyosmani/agent-skills/security-and-hardening) | نعم | P1 (موجود) |
| **shadcn** | مكوّنات UI | [skills.sh](https://skills.sh/shadcn/ui/shadcn) | نعم | P2 (موجود) |
| **telegram-bot** (مجتمع) | مرجع أنماط بوت — المنتج يستخدم grammy أصلاً | [skills.sh](https://skills.sh/claude-office-skills/skills/telegram-bot) | لا (تخطّيناه عمداً — لدينا `telegram_ops_notifier` CORE) | P3 |
| **Feishu/Lark calendar/drive** | تثبيتات ضخمة لكن خارج مكدس Google | [lark-calendar](https://skills.sh/larksuite/cli/lark-calendar) | لا — غير مناسب | تخطّي |

### مهارات CORE داخل المنتج (`skills/*/SKILL.md`) — مثبتة

تغطي بالفعل: بريد، تقويم، Drive، تيليجرام، Word/PDF/Excel، عروض، HITL، حوكمة NCNP، واتساب نصي. انظر `docs/skills-and-mcp.md`.

---

## MCPs الموصى بها

| الاسم | ليش مفيدة لـ ArabicBuzz | رابط | مثبت؟ | أولوية |
|-------|-------------------------|------|-------|--------|
| **playwright** | متصفح/تحقق UI | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | نعم (Cursor) | P0 |
| **context7** | وثائق مكتبات محدّثة | [upstash/context7](https://github.com/upstash/context7) | نعم | P0 |
| **supabase** | استعلام الجداول (قراءة) | [docs](https://supabase.com/docs/guides/getting-started/mcp) | نعم (OAuth remote) | P0 |
| **github** | قضايا/PR/CI | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) · رسمي أحدث: [github/github-mcp-server](https://github.com/github/github-mcp-server) | نعم (يحتاج PAT) | P0 |
| **markitdown** | PDF/Office → Markdown | [microsoft/markitdown](https://github.com/microsoft/markitdown) | نعم | P0 |
| **fetch / duckduckgo / brave** | بحث وويب | [servers](https://github.com/modelcontextprotocol/servers) · DuckDuckGo بلا مفتاح | نعم | P0 |
| **imap** | بريد غير-Gmail محلياً | [@aiwerk/mcp-server-imap](https://github.com/aiwerk/mcp-server-imap) | نعم (يحتاج IMAP_*) | P1 |
| **postgres-toolbox** | SQL عبر Google MCP Toolbox | [googleapis/mcp-toolbox](https://github.com/googleapis/mcp-toolbox) · npm `@toolbox-sdk/server` | **نعم** (موجة 6، يحتاج DATABASE_URL) | P1 |
| **linear** | تتبّع مهام التطوير | [mcp.linear.app](https://mcp.linear.app/sse) | **نعم** (موجة 6، OAuth) | P2 |
| **google-workspace** (اختياري) | Gmail/Drive/Calendar شامل من Cursor | [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) · [docs](https://workspacemcp.com/docs) | قالب في stubs — المنتج أصلي أولاً | P1 عند الحاجة |
| **telegram userbot** (اختياري) | أرشيف قنوات على الماك | [chigwell/telegram-mcp](https://github.com/chigwell/telegram-mcp) · بديل npm [@chaindead/telegram-mcp](https://www.npmjs.com/package/@chaindead/telegram-mcp) | قالب stubs — البوت المدمج يكفي يومياً | P2 |
| **notion** (اختياري) | معرفة خارجية | [@notionhq/notion-mcp-server](https://www.npmjs.com/package/@notionhq/notion-mcp-server) | قالب stubs | P3 |
| **chrome-devtools** | تشخيص DOM/أداء | [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp) | نعم | P2 |

قوالب النسخ: [`.cursor/mcp.stubs.example.json`](../.cursor/mcp.stubs.example.json)

---

## خطة تثبيت قصيرة (أقصى أثر)

### Top 5 Skills (لهذا الأسبوع)

1. **gws-gmail** — بريد Cursor ↔ عمليات الجمعية  
2. **gws-calendar** — مواعيد  
3. **gws-drive** — Drive  
4. **agent-browser** — بوابات حكومية / تحقق حي  
5. **pptx** — عروض بجانب `arabic-presentations`

→ **مُثبَّتة الآن** في `.cursor/skills/` + `skills-lock.json`.

### Top 5 MCPs (لهذا الأسبوع)

1. فعّل **GITHUB_PERSONAL_ACCESS_TOKEN** إن لم يكن مضبوطاً  
2. أكمل OAuth **Supabase MCP** في Cursor  
3. عيّن **DATABASE_URL** لـ `postgres-toolbox` (قراءة فقط مفضّلة)  
4. انسخ **google-workspace** من stubs فقط إن احتجت تغطية أوسع من أدوات المنتج  
5. اترك **Telegram userbot** للماك فقط؛ يومياً يبقى بوت ArabicBuzz

### أقصى أثر حسب المجال

| المجال | الأهم |
|--------|--------|
| وكلاء الغرف | CORE skills + AI SDK + HITL (موجود) |
| تيليجرام | `telegram_ops_notifier` + grammy (موجود) — MCP userbot اختياري |
| بريد | أدوات Gmail الأصلية + `gws-gmail` + IMAP اختياري |
| تقويم | `gws-calendar` + CORE `calendar_*` |
| Drive | `gws-drive` + CORE `drive_file_organizer` |
| تحويل ملفات | pdf/docx/xlsx/pptx + markitdown |

---

## مصادر للتصفح

- كتالوج المهارات: https://skills.sh/  
- CLI: https://github.com/vercel-labs/skills  
- Awesome skills: https://github.com/JackyST0/awesome-agent-skills  
- دليل المشروع: [skills-and-mcp.md](./skills-and-mcp.md)
