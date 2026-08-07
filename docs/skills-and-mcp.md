# Skills & MCP — Arabic Buzz

دليل سريع لما أُضيف وكيف يُفعَّل. المسار الحي للتحقق: https://arabicbuzz.netlify.app/

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

### مهارات Cursor المنسوخة من GitHub (مجانية)

`accessibility`, `arabic-presentations`, `docx`, `pdf`, `xlsx`, `netlify-deploy`, `netlify-functions`, `ux-writing-arabic`, `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `hebrew-rtl-best-practices`, `gws-workflow-email-to-task`, `recipe-save-email-attachments`, `meeting-notes`, `research` + مهارات عربيةBuzz (`arabicbuzz-live-qa`, `arabicbuzz-rtl-shell`, `arabicbuzz-netlify-api`).

استعادة الكاش المحلي:

```bash
npx skills check
# أو إعادة التثبيت من skills-lock / الأوامر في تاريخ الالتزام
npx skills add anthropics/skills@pdf -y
npx skills add anthropics/skills@docx -y
npx skills add anthropics/skills@xlsx -y
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -y
npx skills add netlify/context-and-tools@netlify-deploy -y
npx skills add netlify/context-and-tools@netlify-functions -y
npx skills add addyosmani/web-quality-skills@accessibility -y
npx skills add sultanalsafran/agent-skills@arabic-presentations -y
npx skills add itady74/ux-writing-arabic@ux-writing-arabic -y
```

## MCP

### Cursor (محلي) — `.cursor/mcp.json`

يعمل بدون مفاتيح: `filesystem`, `memory`, `sequential-thinking`, `git`, `fetch`, `time`, `playwright`, `context7`, `markitdown`.

**موجة 2 (اختيارية):**

| خادم | ملاحظات |
|------|---------|
| `supabase` | `mcp-remote` → `https://mcp.supabase.com/mcp?read_only=true` (OAuth رسمي، قراءة فقط) |
| `imap` | `@aiwerk/mcp-server-imap` — يحتاج `IMAP_*`؛ الإرسال معطّل افتراضياً |

يحتاج مفتاحاً اختيارياً في البيئة:

| خادم | متغير |
|------|--------|
| GitHub | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Brave Search | `BRAVE_API_KEY` (طبقة مجانية) |
| IMAP | `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` |

**تخطّينا عمداً (تكرار / مفتاح / غير مناسب لـ Netlify):** Notion (مفتاح)، Google Workspace MCP منفصل (الأصلي في المنتج يكفي)، Telegram userbot (مفاتيح my.telegram.org؛ البوت المدمج يكفي)، Puppeteer (مكرر لـ Playwright)، WhatsApp Cloud API مدفوع/Meta.

بعد التعديل: Settings → Tools & MCP → Refresh، أو أعد فتح Cursor.

### المنتج على Netlify — كتالوج `lib/mcp/catalog.ts`

- لا stdio داخل دوال Netlify.
- Remote: `MCP_REMOTE_SERVERS`, `MCP_GITHUB_URL`, `MCP_TOOLBOX_URL`, `MCP_MARKITDOWN_URL`, …
- جسر الماك: `node packages/ops-bridge/bin/ab-ops-bridge.mjs list`
- إعدادات الواجهة: إعدادات → أدوات MCP

إضافات الكتالوج: `fetch`, `git`, `google-workspace-mcp` (اختياري), `telegram-mcp` (ماك فقط), `time`, `imap` (محلي/Cursor فقط).

### مفاتيح شائعة (اختياري — لا تخترع قيماً على Netlify)

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
