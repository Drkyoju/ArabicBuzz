# Skills & MCP — Arabic Buzz

دليل سريع لما أُضيف وكيف يُفعَّل. المسار الحي للتحقق: https://arabicbuzz-fooc9h.cranl.net/

## طبقات المهارات

| الطبقة | المسار | لمن؟ |
|--------|--------|------|
| مهارات المساعدين داخل المنتج (CORE) | `skills/*/SKILL.md` | غرف / مساعدون / تيليجرام — تُحقن تلقائياً عبر `lib/skills/core-pack.ts` |
| مهارات Cursor للمشروع | `.cursor/skills/` | وكيل Cursor أثناء التطوير |
| قفل التثبيت | `skills-lock.json` | وصفة `npx skills` لاستعادة `.agents/skills` محلياً |
| كاش محلي (غير مُتتبع) | `.agents/skills/` | ناتج `npx skills add` — مُتجاهل في git |

### موجة CORE 3 (داخل التطبيق)

- `word_docx_assistant` — Word
- `email_to_task` — بريد → مهام
- `email_attachment_filing` — أرشفة مرفقات
- `hitl_approvals_queue` — طابور موافقات HITL
- `arabic_presentation_builder` — عروض RTL
- `gov_web_research` — بحث مصادر رسمية
- `pdf_document_ops` — إنشاء/دمج/ختم PDF
- `calendar_email_ingest` — مواعيد من البريد

### موجة CORE 4 (عقود / محاسبة جمعيات / حوكمة / واتساب نصي)

- `arabic_contract_review` — مراجعة عقود (قائمة تحقق، ليست استشارة قانونية)
- `association_bookkeeping_lite` — محاسبة مبسطة من الجداول
- `ncnp_governance_auditor` — تدقيق محاضر (المركز الوطني) — رُقّيت إلى CORE
- `whatsapp_ops_drafter` — صياغة رسائل واتساب تشغيلية (بدون Cloud API)

**تغطية سابقة كافية (لم نُكرّر):** محاضر MSA، Drive، مواعيد امتثال، تيليجرام، Excel/PDF/Word، بحث حكومي، HITL، أرشفة مرفقات.

### مهارات Cursor — موجة 6 (أغسطس 2026) — Google / متصفح / عروض

| مهارة | المصدر | لماذا؟ | تثبيت skills.sh |
|-------|--------|--------|-----------------|
| `gws-gmail` | googleworkspace/cli | بريد Gmail لوكيل Cursor (~69K) | https://skills.sh/googleworkspace/cli/gws-gmail |
| `gws-calendar` | googleworkspace/cli | تقويم Google (~51K) | https://skills.sh/googleworkspace/cli/gws-calendar |
| `gws-drive` | googleworkspace/cli | Drive (~64K) | https://skills.sh/googleworkspace/cli/gws-drive |
| `pptx` | anthropics/skills | عروض PowerPoint (~197K) بجانب `arabic-presentations` | https://skills.sh/anthropics/skills/pptx |
| `agent-browser` | vercel-labs/agent-browser | أتمتة متصفح (~643K) | https://skills.sh/vercel-labs/agent-browser/agent-browser |
| `mcp-builder` | anthropics/skills | بناء خوادم MCP (~99K) | https://skills.sh/anthropics/skills/mcp-builder |

```bash
npx skills add googleworkspace/cli@gws-gmail -y
npx skills add googleworkspace/cli@gws-calendar -y
npx skills add googleworkspace/cli@gws-drive -y
npx skills add anthropics/skills@pptx -y
npx skills add vercel-labs/agent-browser@agent-browser -y
npx skills add anthropics/skills@mcp-builder -y
```

### مهارات Cursor — موجة 5 (أغسطس 2026)

أُضيفت مهارات مجانية عالية القيمة متوافقة مع المكدس (Next.js / AI SDK / Supabase / shadcn / Vitest):

| مهارة | المصدر | لماذا؟ |
|-------|--------|--------|
| `shadcn` | shadcn/ui | CLI ومكوّنات UI (~272K تثبيت) |
| `supabase` + `supabase-postgres-best-practices` | supabase/agent-skills | Postgres/Supabase (~300K+) |
| `ai-sdk` | vercel/ai | Vercel AI SDK الرسمي |
| `nextjs-app-router-patterns` | wshobson/agents | أنماط App Router |
| `vitest` | antfu/skills | اختبارات الوحدة (مستخدمة في المشروع) |
| `security-and-hardening` | addyosmani/agent-skills | أمان الويب |
| `security-review` | getsentry/skills | مراجعة أمنية |
| `typescript-advanced-types` | wshobson/agents | TypeScript متقدم |
| `tailwind-design-system` | wshobson/agents | أنظمة تصميم Tailwind |
| `prisma-cli` / `prisma-client-api` / `prisma-postgres` / `prisma-database-setup` / `prisma-upgrade-v7` | prisma/skills | نُسخت إلى `.cursor/skills` (كانت في القفل فقط) |

### مهارات Cursor السابقة (مُبقاة)

`accessibility`, `arabic-presentations`, `docx`, `pdf`, `xlsx`, `netlify-deploy`, `netlify-functions`, `ux-writing-arabic`, `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `hebrew-rtl-best-practices`, `gws-workflow-email-to-task`, `recipe-save-email-attachments`, `meeting-notes`, `research`, `playwright-core` (TestDino), `design-taste-frontend`, `redesign-existing-projects`, ومهارات ArabicBuzz (`arabicbuzz-testing`, `arabicbuzz-live-qa`, `arabicbuzz-rtl-shell`, `arabicbuzz-netlify-api`, `arabicbuzz-taste`).

استعادة الكاش المحلي:

```bash
npx skills check
npx skills add shadcn/ui@shadcn -y
npx skills add supabase/agent-skills@supabase -y
npx skills add supabase/agent-skills@supabase-postgres-best-practices -y
npx skills add vercel/ai@ai-sdk -y
npx skills add wshobson/agents@nextjs-app-router-patterns -y
npx skills add antfu/skills@vitest -y
npx skills add addyosmani/agent-skills@security-and-hardening -y
npx skills add getsentry/skills@security-review -y
npx skills add wshobson/agents@typescript-advanced-types -y
npx skills add wshobson/agents@tailwind-design-system -y
npx skills add testdino-hq/playwright-skill/core -y
npx skills add anthropics/skills@pdf -y
npx skills add anthropics/skills@docx -y
npx skills add anthropics/skills@xlsx -y
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -y
npx skills add vercel-labs/agent-skills@web-design-guidelines -y
npx skills add netlify/context-and-tools@netlify-functions -y
npx skills add addyosmani/web-quality-skills@accessibility -y
npx skills add sultanalsafran/agent-skills@arabic-presentations -y
npx skills add itady74/ux-writing-arabic@ux-writing-arabic -y
```

### تخطّينا عمداً (مهارات)

| مرشّح | السبب |
|-------|--------|
| حزمة Apify كاملة | مدفوعة / scraping مدفوع |
| `clerk-nextjs-patterns` | لا نستخدم Clerk |
| `nextjs-supabase-auth` / Better Auth skills | مصادقة المنتج مخصّصة |
| `firebase-security-*` | لا Firebase |
| `expo-tailwind-setup` | ليس Expo |
| `prisma-mongodb-*` / `prisma-compute` / driver-adapter | غير مستخدمة يومياً في هذا المكدس |
| تكرار Playwright/Puppeteer skills | لدينا `playwright-core` + MCP Playwright |

## اختبارات (مجانية / خفيفة)

| الأمر | الغرض |
|-------|--------|
| `npm run test:unit` | Vitest — intents تيليجرام، أخطاء عربية، dedupe |
| `npm run test:live-smoke` | فحص API/HTML ضد CranL (بدون متصفح — يعمل على Monterey) |
| `npm run test:e2e:smoke` | Playwright ضد CranL (يحتاج Chromium أحدث من macOS 12) |
| `npm run test:evals -- --offline` | مقاييس الوكيل العربية/الأمان (موجودة) |
| `npm run test:promptfoo` | بوابات نصية خفيفة عبر `npx promptfoo` (بدون تثبيت ثقيل) |

لا تستخدم localhost لـ QA المنتج.

## MCP

### Cursor (محلي) — `.cursor/mcp.json`

يعمل بدون مفاتيح: `filesystem`, `memory`, `sequential-thinking`, `git`, `fetch`, `time`, `playwright`, `context7`, `markitdown`, **`duckduckgo`**, **`chrome-devtools`**.

**موجة 2 (اختيارية بمفتاح / OAuth):**

| خادم | ملاحظات |
|------|---------|
| `supabase` | `mcp-remote` → `https://mcp.supabase.com/mcp?read_only=true` (OAuth رسمي، قراءة فقط) |
| `imap` | `@aiwerk/mcp-server-imap` — يحتاج `IMAP_*`؛ الإرسال معطّل افتراضياً |
| `github` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `brave-search` | `BRAVE_API_KEY` (طبقة مجانية) — اختياري؛ DuckDuckGo يغطي البحث بلا مفتاح |

**موجة 5 (أغسطس 2026):**

| خادم | ملاحظات |
|------|---------|
| `duckduckgo` | `@ericthered926/duckduckgo-mcp-server` — بحث مجاني بلا مفتاح |
| `chrome-devtools` | `chrome-devtools-mcp` — تشخيص أداء/DOM بجانب Playwright |

**موجة 6 (أغسطس 2026) — مفعّل في `.cursor/mcp.json`:**

| خادم | ملاحظات |
|------|---------|
| `linear` | `mcp-remote` → `https://mcp.linear.app/sse` (OAuth عند أول استخدام) |
| `postgres-toolbox` | `@toolbox-sdk/server --prebuilt=postgres` — يحتاج `DATABASE_URL` |

**قوالب اختيارية (لا تُشغَّل تلقائياً):** انسخ من [`.cursor/mcp.stubs.example.json`](../.cursor/mcp.stubs.example.json) بعد ضبط المتغيرات — Google Workspace (`uvx workspace-mcp`)، تيليجرام userbot، Notion، GitHub الرسمي الجديد.

يحتاج مفتاحاً اختيارياً في البيئة:

| خادم | متغير |
|------|--------|
| GitHub | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Brave Search | `BRAVE_API_KEY` (طبقة مجانية) |
| IMAP | `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` |

**تخطّينا عمداً (تكرار / مفتاح / غير مناسب لـ CranL Docker):**

| مرشّح | السبب |
|-------|--------|
| `@modelcontextprotocol/server-postgres` | أُزيل من npm؛ استخدم MCP Toolbox / Supabase |
| Notion | مفتاح |
| Google Workspace MCP منفصل | الأصلي في المنتج يكفي |
| Telegram userbot | مفاتيح my.telegram.org؛ البوت المدمج يكفي |
| Puppeteer | مكرر لـ Playwright |
| WhatsApp Cloud API | مدفوع/Meta |
| Apify | مدفوع |
| Kubernetes MCP | خارج نطاق المنتج |

بعد التعديل: Settings → Tools & MCP → Refresh، أو أعد فتح Cursor.

### المنتج على CranL / Netlify — كتالوج `lib/mcp/catalog.ts`

- لا stdio داخل دوال السحابة.
- Remote: `MCP_REMOTE_SERVERS`, `MCP_GITHUB_URL`, `MCP_TOOLBOX_URL`, `MCP_MARKITDOWN_URL`, …
- جسر الماك: `node packages/ops-bridge/bin/ab-ops-bridge.mjs list`
- إعدادات الواجهة: إعدادات → أدوات MCP

إضافات الكتالوج: `fetch`, `git`, `google-workspace-mcp` (اختياري), `telegram-mcp` (ماك فقط), `time`, `imap` (محلي/Cursor فقط).

### مفاتيح شائعة (اختياري — لا تخترع قيماً على CranL)

```
GITHUB_PERSONAL_ACCESS_TOKEN=
BRAVE_API_KEY=
IMAP_HOST=
IMAP_USER=
IMAP_PASS=
MCP_TOOLBOX_URL=
MCP_GITHUB_URL=
MCP_MARKITDOWN_URL=
MCP_REMOTE_SERVERS=
MCP_GOOGLE_WORKSPACE_URL=
SUPABASE_MCP_URL=
FIRECRAWL_API_KEY=
```

المسار المجاني للبحث داخل المنتج يبقى بدون مفاتيح: DuckDuckGo + Wikipedia + gov.sa + Jina Reader.

### موجة 7 / Track C (أغسطس 2026) — مجاني أولاً

| ماذا | أين | ملاحظات |
|------|-----|---------|
| توسيع `free-execute-map` | `lib/agents/tools/free-execute-map.ts` | web_search / web_fetch / Drive / Gmail / GitHub → builtins |
| كتالوج `duckduckgo` | `lib/mcp/catalog.ts` | موثّق كمسار مجاني محلي |
| مهارة Cursor | `.cursor/skills/arabicbuzz-free-mcp` | تفضيل المسار المجاني على Firecrawl المدفوع |
| Hermes MCP | `~/.hermes/config.yaml` (محلي — لا يُرفع) | مفعّل: filesystem, memory, sequential-thinking, duckduckgo, context7, github — معطّل على Monterey: time/git/markitdown |
| Hermes skill | `~/.hermes/skills/research/duckduckgo-search` | احتياطي عند غياب `FIRECRAWL_API_KEY` |

بوت تيليجرام: عجز القدرة → `research_task_tools` → إن `canExecuteFree` نفّذ `executeNext` ثم `return_file`.
