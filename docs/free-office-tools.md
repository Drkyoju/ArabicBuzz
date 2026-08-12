# أدوات المكتب والتحويل والـ OCR المجانية

ما يحتاجه الوكيل لقراءة **صور** و**PDF ممسوح قديم** (ورقي/صورة — لا يمكن نسخ النص بالكيبورد) وتحويل Office — بلا نواة مدفوعة إلزامية.

## الجواب المختصر

| السؤال | الجواب |
|--------|--------|
| هل يستخرج الوكيل نصاً عربي+إنجليزي من الصور؟ | **نعم** — `read_document` و`arabic_ocr` |
| وهل من PDF ممسوح بلا طبقة نص؟ | **نعم** — يُكتشف تلقائياً ويُشغَّل OCR صفحة بصفحة |
| هل الجودة 100%؟ | **لا** — تعتمد على وضوح المسح والإضاءة؛ هذا أفضل مسار مجاني عملي |

CloudConvert يبقى **اختياري بمفتاح**. Google Drive (ربط مجاني) أفضل للتحويل عالي الجودة. لا نستخدم نوى Apify مدفوعة لهذا المسار.

## المكدس المجاني المعتمد

| الغرض | الأداة | أين تعمل | ملاحظة |
|-------|--------|----------|--------|
| OCR صفحات PDF + صور | **PaddleOCR عربي** أولاً ثم **Tesseract `ara+eng`** | جسر الماك `POST /ocr/paddle` → `/pdf-page-ocr` | مجاني — Paddle عبر `scripts/paddle-ocr-venv`؛ Tesseract عبر brew |
| كشف PDF ممسوح | `lib/documents/scanned-detect.ts` | Netlify | صفحات فارغة/قصيرة أو ToUnicode معطوب |
| قراءة وكيل صفحة بصفحة | `read_document` → `readDocumentPages` | Netlify + ماك | حتى 8 صفحات OCR لكل استدعاء ثم `nextPageStart` |
| OCR صورة مفردة | `arabic_ocr` / `read_document` | نفسه | png/jpg/webp/tiff |
| PDF→DOCX عربي | `convert_document`: Paddle → Tesseract → Gemini → توقّف (Mistral opt-in) → محلي نظيف أو ارفض | **معطّل:** Drive طلاسم، pdf2docx عربي، pdf-lib عربي |
| PDF→XLSX / XLSX→DOCX | CloudConvert أو rebuild منظّم (جداول) | CranL | Drive لا يعبر عائلات Docs↔Sheets |
| Office↔PDF دائم | **LibreOffice sidecar** (`CONVERT_SERVICE_URL`) | VPS / Fly / `docker-compose.convert.yml` | مجاني — أولاً في السلسلة؛ CranL يبقى رقيقاً |
| طبقة نص قابلة للبحث | **OCRmyPDF** (اختياري) | venv الماك | يحتاج ghostscript + tesseract |
| DOCX/PPTX/XLSX | python-docx · python-pptx · openpyxl + JS (docx/exceljs) | venv / Netlify | تعديل واستخراج |
| قرارات طويلة → Markdown | **MarkItDown** | `POST /markitdown` + MCP | `pip install "markitdown[all]"` |
| تحويل عبر العائلات | Google Drive | حساب مربوط | أفضل مجاني للتخطيط |
| احتياطي مدفوع | CloudConvert | `CLOUDCONVERT_API_KEY` | اختياري فقط |

**تخطي:** EasyOCR/Marker/Nougat الثقيلة كاعتماد أساسي (غير عملية على Netlify). يمكن ربطها لاحقاً عبر URL إن شغّلتها محلياً.

## ماذا يفعل الوكيل تلقائياً؟

1. يستخرج طبقة النص (pdfjs / mammoth / …).
2. إن كانت الصورة أو معظم صفحات PDF فارغة/قصيرة/معطوبة → يُعلَّم «ممسوح».
3. يشغّل OCR للتحويل النظيف (PDF→Office):
   - **PaddleOCR عربي** أولاً إن وُجد (mac-hop `/ocr/paddle` أو `PADDLE_OCR_URL` / `ENABLE_PADDLE_OCR`)
   - ثم **Tesseract** على الماك إن ضعف/غاب Paddle
   - ثم Gemini Flash → Gemini أقوى إن ضعف النص
   - ثم **توقّف** — لا Mistral تلقائي. Mistral فقط مع `CONVERT_ALLOW_MISTRAL=1` و`MISTRAL_API_KEY` (افتراضي OFF)
   - وإلا رفض عربي صريح بلا ملف طلاسم (يعرض خيار تجربة Mistral لاحقاً أو إيقاف الملف)
   - للقراءة العامة: Paddle → Tesseract → Qari → Gemini
4. يعيد النص مع `ocrUsed=true` و`warningAr` إن لزم.
5. للمستندات الطويلة: كرّر `read_document(pageStart=nextPageStart)` حتى `hasMore=false`.

أدوات الشات: `read_document` · `arabic_ocr` · `convert_document` · `read_decision_document`.

## تثبيت على ماك المستخدم (مرة واحدة)

```bash
# 1) PaddleOCR عربي (أساسي) — Python 3.11
python3.11 -m venv scripts/paddle-ocr-venv
scripts/paddle-ocr-venv/bin/pip install paddlepaddle paddleocr pillow

# 2) Tesseract احتياطي عربي+إنجليزي
brew install tesseract tesseract-lang

# اختياري: تحويل Office محلي + طبقة OCR في PDF
brew install pandoc ghostscript
# LibreOffice (كبير): من الموقع أو
# brew install --cask libreoffice

# 3) بيئة بايثون لأدوات المشروع (PyMuPDF / tesseract)
cd /path/to/ArabicBuzz
python3 -m venv scripts/pdf-tools-venv
scripts/pdf-tools-venv/bin/pip install -r scripts/pdf-tools-requirements.txt

# 4) تشغيل جسر الماك + نفق (ngrok/cloudflared) وضبط CranL:
#    MAC_SYNC_URL=https://….trycloudflare.com
#    MAC_SYNC_SECRET=…
npm run storage:sync
```

تحقق:

```bash
tesseract --list-langs   # يجب أن تظهر ara و eng
scripts/paddle-ocr-venv/bin/python -c "import paddleocr; print('ok')"
curl -s http://127.0.0.1:7420/health | jq .tools
```

`tools.paddle: true` = Paddle أساسي جاهز · `tools.tesseract: true` = احتياطي Tesseract جاهز.

## متغيرات البيئة

| متغير | إلزامي؟ | الدور |
|-------|---------|--------|
| `MAC_SYNC_URL` + `MAC_SYNC_SECRET` | لجودة OCR مجانية عالية | جسر الماك (`/ocr/paddle` + `/pdf-page-ocr`) |
| `GEMINI_API_KEY` | عادة موجود | احتياطي سحابي بعد Paddle/Tesseract |
| `CONVERT_SERVICE_URL` / `LIBREOFFICE_URL` + `CONVERT_SECRET` | مُستحسن للتحويل بلا ماك | sidecar LibreOffice — `deploy/libreoffice-convert/` و`docker-compose.convert.yml` |
| `PADDLE_OCR_URL` / `ENABLE_PADDLE_OCR` | اختياري | sidecar أو محلي إن لم يُستخدم mac-hop. لا يُضمَّن في صورة CranL — انظر `deploy/paddle-ocr/` و`docs/mac-ocr-tesseract.md` |
| `CONVERT_ALLOW_MISTRAL` | اختياري — افتراضي OFF | يجب `=1` مع `MISTRAL_API_KEY` لتشغيل Mistral بعد السلسلة المجانية؛ بدونها نتوقّف ونرفض بلا طلاسم |
| `MISTRAL_API_KEY` | اختياري مدفوع | لا يُستدعى تلقائياً — يحتاج أيضاً `CONVERT_ALLOW_MISTRAL=1` |
| `QARI_OCR_URL` | اختياري | Qari محلي |
| Google OAuth (ربط المستخدم) | لمسار Drive | لا مفتاح تحويل إضافي — يستخدم `drive.file` بعد الربط |
| `CLOUDCONVERT_API_KEY` | اختياري مدفوع | تحويل صيغ فقط — **لا يُشترى تلقائياً** |
| `TESSERACT_CMD` | اختياري | مسار tesseract إن لم يكن في PATH |
| `TESSERACT_OCR_LANG` | اختياري | افتراضي `ara+eng` |

## خدمات مدفوعة (اختيارية — موافقة صريحة مطلوبة)

| اسم الخدمة | ليش | تقريباً السعر / نموذج الدفع | رابط | هل نقدر نشتغل بدونها بعد تفعيل المجاني؟ |
|------------|-----|------------------------------|------|------------------------------------------|
| **CloudConvert** | تحويل عبر عائلات Office (مثل PDF→XLSX) وجودة عالية كاحتياطي | باقات حسب الدقائق/الملفات — غالباً اشتراك أو رصيد prepaid | https://cloudconvert.com/pricing | **نعم** — Drive + LibreOffice + rebuild منظّم يكفي لمعظم Word↔PDF |
| **Marker / Surya OCR (سحابة مدفوعة)** | تخطيط OCR عربي أدق من Tesseract | حسب المزوّد (غالباً GPU/ساعة أو API) | روابط الجسور في `.env.example` | **نعم** — Tesseract عبر الماك + Gemini/Qari مجاني/موجود |
| **ConvertAPI / Aspose / Adobe PDF Services** | غير مدمجة؛ بدائل مدفوعة | حسب المزود | — | **نعم** — غير مستخدمة |
| **OCR سحابي مدفوع (غير Gemini)** | إن رغبت بمزوّد خارج المكدس الحالي | حسب المزود | — | **نعم** — المسار المجاني مفعّل |

**لا نضيف مفاتيح مدفوعة دون موافقتك.** المسار المعتمد: LibreOffice على CranL + Google Drive بعد ربط الحساب.

## حدود صادقة

- مسح ضبابي / مائل / دقة منخفضة → أخطاء OCR متوقعة.
- PDF فيه نص معطوب (ToUnicode) يبدو صحيحاً بصرياً لكن النسخ يعطي طلاسم — نفضّل OCR أو Google Drive لا rebuild نصّي أعمى.
- بدون جسر ماك ولا Gemini: OCR المحلي غير متاح على Netlify (لا Tesseract في الدالة).
- LibreOffice غير مثبت على Netlify/CranL (صورة رقيقة). المسار المجاني بلا ماك: **`CONVERT_SERVICE_URL`** → sidecar (`docker-compose.convert.yml`) ثم Drive بعد الربط. جسر الماك احتياطي فقط.

انظر أيضاً: [file-edit-engines.md](./file-edit-engines.md) · مهارة `document_ocr_workflow`.
