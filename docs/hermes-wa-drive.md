# هيرميس ↔ Google Drive (واتساب فقط)

هيرميس على الماك = **واتساب فقط** (`+966550514658`). لا تيليجرام. بوت الجمعية `@alhuda14bot` منفصل (ArabicBuzz / CranL).

## مجلد العمل

| | |
|---|---|
| Folder ID | `1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw` |
| الرابط | https://drive.google.com/drive/folders/1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw |
| الحساب المتوقّع لـ OAuth / الملكية | **`ryodan71@gmail.com`** |

هذا المجلد مضبوط في `~/.hermes` (`HERMES_DRIVE_FOLDER_ID` + `SOUL.md` + مهارات `waqf-drive` / `wa-archive` / `wa-file-read`).  
**مجلد عقل الشركة في ArabicBuzz مختلف** (`GOOGLE_DRIVE_BRAIN_FOLDER_ID` / `1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW`) — لا تخلطهما ولا تغيّر CranL من أجل هيرميس.

## أرشفة واتساب → الوقف (منشن فقط)

السلوك المقصود (anti-ban أولاً):

1. في قروب **عمل الوقف** (`120363429457422075@g.us`) أو قروب الـ allowlist: أرسل ملفًا / صورة / صوتًا.
2. **منشن** هيرميس (أو اكتب هيرميس / Hermes) واطلب صراحة: «أرشفة» / «ارشف» / «احفظ في الدرايف».
3. هيرميس يستخدم المسار المحلي للمرفق (Baileys ينزّله إلى `document_cache` / `image_cache` / `audio_cache`) ثم:
   ```bash
   ./scripts/hermes-wa-drive-archive.sh --archive /path/to/local/file
   ```
4. السكربت ينتظر تأخيراً افتراضياً **8 ثوانٍ** (`HERMES_ARCHIVE_DELAY_SEC`) قبل الرفع لتقليل نمط الأتمتة، ثم يرفع إلى مجلد الوقف ويرد **برسالة واحدة** قصيرة (اسم + رابط إن وُجد).

**لا** أرشفة صامتة لكل وسائط القروب بدون طلب — ذلك يزيد الضوضاء وخطر سوء الاستخدام.  
**لا** ردود على رسائل خاصة من غرباء (`unauthorized_dm_behavior: ignore`).

أوامر مساعدة في القروب (مع منشن):

| العبارة | الفعل |
|--------|--------|
| أرشفة / ارشف | رفع المرفق الحالي إلى الوقف |
| حالة الأرشيف | سرد أحدث الملفات في المجلد |
| بحث … / ابحث في الدرايف | `fullText` داخل مجلد الوقف فقط |
| لخّص / اقرأ المرفق / OCR | استخراج نص PDF/DOCX/نص أو OCR خفيف ثم تلخيص عربي |
| حالة الأدوات | صحة MCP/Drive/OCR بلا أسرار |
| اقرأ الرابط … / ويكيبيديا … | Jina/fetch أو MCP wikipedia |

محلياً:

```bash
npm run hermes:drive:archive:status
npm run hermes:tools:status
./scripts/hermes-wa-drive-archive.sh --search 'كلمة' --max 10
./scripts/hermes-file-read.sh /path/to/file.pdf
./scripts/hermes-file-read.sh /path/to/scan.png          # OCR (tesseract ara+eng)
./scripts/hermes-jina-fetch.sh 'https://example.com'   # قراءة صفحة مجاناً عبر Jina
```

## قراءة الملفات (مجاني)

| النوع | المسار |
|------|--------|
| PDF نصّي / DOCX / نص | `scripts/hermes-file-read.sh` عبر `~/.hermes/docs-venv` (pymupdf + pypdf + python-docx) |
| PDF ممسوح بلا نص | OCR خفيف: tesseract + pillow/pytesseract (أول 3 صفحات افتراضياً) — **لا** marker-pdf (~5GB) |
| صور | نفس السكربت (OCR) أو vision المدمج إن فشل OCR |
| صوت | STT Hermes (`language: ar`) إن مضبوط — لا اختلاق نص |
| روابط ويب | Jina Reader أو MCP `fetch` / `wikipedia` / `duckduckgo` — فضّل المجاني على Firecrawl/Brave |

مهارات Hermes المحلية: `wa-archive`, `wa-file-read`, `waqf-drive`, `ar-help`.  
مهارات مدمجة مفيدة: `pdf`, `ocr-and-documents`, `docx`, `google-workspace`, `duckduckgo-search`.

## كيف يتصل هيرميس بـ Drive؟

المسار المفضّل: مهارة مدمجة **`google-workspace`** (OAuth2 → `~/.hermes/google_token.json`) عبر:

```bash
hermes-gapi drive list-waqf
# = google_api.py داخل ~/.hermes/google-venv
```

بديل رسمي من Google: MCP `https://drivemcp.googleapis.com/mcp/v1` يحتاج OAuth client مسبّق التسجيل وغالباً أعقد على Monterey — **لا نستخدمه افتراضياً**.

## ماذا انكسر؟ (`redirect_uri_mismatch`)

عميل **Potato App** في Google Cloud هو عميل **Web**، والـ redirect المسجّل عنده فعلياً هو فقط:

`https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`

مهارة Hermes تستخدم `http://localhost:1` كبديل لـ OOB (منفذ 1 عمداً حتى لا يستمع أحد — تنسخ الكود من شريط العنوان). هذا الـ URI **غير مسجّل** على عميل Web، وGoogle ترفضه فوراً. ملف `google_client_secret.json` كان مُشكَّلاً كـ `installed` محلياً لكن Google لا تتجاهل نوع العميل الحقيقي على السيرفر — loopback لا يُقبل لهذا الـ client.

## إعادة استخدام OAuth ArabicBuzz؟

| الطبقة | الحالة |
|--------|--------|
| **نفس حساب Google** (`ryodan71@gmail.com`) | ✅ مطلوب |
| **نفس Client ID (Web / Potato App)** | ✅ عبر `--from-arabicbuzz` (تجديد refresh بدون redirect) |
| **`--auth-url` + localhost:1** | ❌ لا يعمل على عميل Web الحالي |
| **عميل Desktop منفصل** | اختياري لاحقاً إن أردت موافقة Hermes كاملة بدون ArabicBuzz |

أسرار العميل والرمز تبقى في `~/.hermes/` فقط — **لا تُرفع للمستودع**.

## إكمال الربط (المسار الصحيح)

```bash
# المفضّل — بدون Console / بدون localhost:1
./scripts/hermes-drive-setup.sh --from-arabicbuzz
./scripts/hermes-drive-setup.sh --probe
```

يتطلّب أن يكون `ryodan71@gmail.com` مربوطاً أصلاً في ArabicBuzz (تقويم/Drive) وفي قاعدة البيانات `google_oauth_tokens` مع `refresh_token`.

الرفع (`upload-waqf` / أرشفة واتساب) يعمل حالياً مع الصلاحيات الجزئية المختبرة؛ إن فشل لاحقاً، أعد «ربط Google» من ArabicBuzz ثم أعد `--from-arabicbuzz` لصلاحيات أوسع.

سكربت مساعد: `./scripts/hermes-drive-setup.sh`

## مشاركة المجلد

- إن كان المالك `ryodan71@gmail.com` وأكملتَ OAuth به → يكفي.
- إن أكملتَ OAuth بحساب آخر → شارك المجلد معه (محرّر إن أردت الرفع).
- رابط «أي شخص لديه الرابط» وحده **لا يكفي** لأدوات Drive API بدون صلاحية للحساب المصادق.

## Anti-ban

Drive والأرشفة فقط عند طلب صريح في واتساب (منشن / رد / أمر). لا مراقبة دورية للمجلد ولا بث تلقائي. أبقِ `WHATSAPP_REQUIRE_MENTION=true`. تأخير الأرشفة عبر `HERMES_ARCHIVE_DELAY_SEC` (افتراضي 8).

## حالة الربط

```bash
./scripts/hermes-drive-setup.sh --status
./scripts/hermes-drive-setup.sh --probe
npm run hermes:drive:archive:status
```

`AUTHENTICATED` (حتى لو partial) + نجاح `drive get` / `list-waqf` = مربوط للقراءة/الرفع المختبر. غير ذلك = شغّل `--from-arabicbuzz` بعد ربط Google في ArabicBuzz.

## MCP / مهارات مجانية على هيرميس

انظر أيضاً [hermes-mac-always-on.md](./hermes-mac-always-on.md#b-hermes-messaging-gateway--بوابة-الرسائل) و [skills-and-mcp.md](./skills-and-mcp.md).

| مفعّل | معطّل / متجنَّب |
|--------|------------------|
| filesystem, memory, sequential-thinking, duckduckgo, context7, time, **fetch**, **wikipedia** (`mcp-server-wikipedia`) | git / markitdown (هش على Monterey)؛ github بدون PAT |
| مهارات: wa-archive, wa-file-read, waqf-drive, ar-help, pdf, duckduckgo-search, google-workspace | Firecrawl/Brave ما لم يكن المفتاح موجوداً؛ Drive HTTP MCP الرسمي؛ marker-pdf الضخم؛ كتالوج Hermes المدفوع (Figma/Linear/…)؛ Playwright/Chrome الثقيل على Monterey |
