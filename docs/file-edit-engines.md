# محركات تعديل وتحويل الملفات (Office / PDF)

ترتيب الجودة العملية على Netlify (بدون خادم LibreOffice):

| المرتبة | المحرّك | التكلفة | الجودة | متى يُستخدم |
|--------|---------|---------|--------|-------------|
| **1** | **Google Drive** (استيراد → Docs/Sheets/Slides → تصدير) | **مجاني** مع حساب Google مربوط | ممتاز / فوق الممتاز للتخطيط والصور داخل عائلات Office | `convert_document` تلقائياً إن مربوط |
| **2** | **CloudConvert** | اختياري مدفوع (`CLOUDCONVERT_API_KEY`) | ممتاز عبر العائلات والصيغ القديمة (doc/ppt/xls) | إن وُجد المفتاح وفشل/غير متاح Google |
| **3** | **مسار مجاني محلي** (docx / exceljs / pdf-lib / pptxgenjs / JSZip) | مجاني دائماً | ممتاز للتعديل الموضعي؛ تحويل نصّي فقط لـ pdf↔docx | تعديل بدون تحويل؛ أو احتياطي تحويل |
| — | LibreOffice headless عبر جسر الماك | مجاني محلياً | ممتاز إن وُجد على الماك | **غير مدمج** كمحرّك تحويل داخل Netlify (MarkItDown للقراءة فقط) |
| — | ConvertAPI وغيره | مدفوع | مشابه لـ CloudConvert | غير مستخدم — CloudConvert كافٍ كاحتياطي مدفوع |

## ما يفعله المستخدم (بدون دفع)

1. سجّل الدخول في Arabic Buzz.
2. من الإعدادات → **ربط Google (Drive)** (نفس موافقة التقويم/Gmail).
3. ارفع ملفاً واطلب من الشات: «حوّل إلى Word/PDF/Excel…» — الأداة `convert_document` / `convert_file`.

**لا يلزم دفع** لجودة تحويل عالية عبر Google. CloudConvert اختياري فقط إن أردت احتياطاً مدفوعاً أو صيغاً خارج عائلات Google.

## تعديل موضعي (بدون تحويل) — مجاني دائماً

| الصيغة | قراءة | إنشاء | تعديل مع الحفاظ على البنية | ملاحظات |
|--------|-------|--------|---------------------------|---------|
| **DOCX** | mammoth / officeparser | `docx` | `edit_document(replacements)` أو `templateData` | استبدال OOXML عبر JSZip؛ قوالب `{tag}` عبر docxtemplater |
| **XLSX** | exceljs | exceljs | `edit_excel(cells)` | يحافظ على الأوراق والأنماط |
| **PDF** | pdf-parse + OCR | pdf-lib | **`pdf_replace_text`** (خط مضمّن من PDF إن وُجد، وإلا `insert_htmlbox` / HarfBuzz) · `pdf_stamp` / `pdf_merge` / `pdf_fill_form` | استبدال عربي: لا تستخدم stamp ولا إعادة بناء — يفصل الحروف. على Netlify يلزم جسر الماك + pymupdf + arabic-reshaper |
| **PPTX** | officeparser | pptxgenjs | `edit_document(replacements)` | أو `slides` لإعادة بناء نصية |

أدوات الشات: `read_document` → `edit_document` / `edit_excel` / `pdf_*` → زر تنزيل (`return_file` إن لزم).

مكتبات OSS: `docx` · `mammoth` · `exceljs` · `pdf-lib` · `pptxgenjs` · `jszip` · `docxtemplater` · `pizzip` · `officeparser` · **PyMuPDF** (`scripts/pdf-arabic-replace.py`)

### استبدال نص عربي داخل PDF (مهم)

| المحرّك | الجودة للعربية | متى |
|--------|----------------|-----|
| **خط مضمّن من PDF** (Sakkal Majalla وغيرها) + arabic-reshaper | الأقرب للأصل — نفس ملف TTF المضمّن | تلقائي في `pdf_replace_text` عند وجود خط عربي مضمّن |
| **PyMuPDF `insert_htmlbox`** (HarfBuzz / Noto Naskh) | جيد جداً — حروف متصلة + RTL | احتياطي إن لم يُستخرج خط مضمّن صالح |
| pdf-lib / `pdf_stamp` / reverse يدوي | سيء (حروف منفصلة) | ختم/ملاحظة فقط — **ليس** لاستبدال أسماء |
| CloudConvert pdf↔docx | تحويل صيغ؛ التخطيط قد يتغيّر | اختياري مدفوع `CLOUDCONVERT_API_KEY` — ليس بديلاً مثاليًا للتعديل الموضعي |
| Aspose / Apryse / Adobe PDF Services | ممتاز غالباً (مدفوع SaaS) | غير مدمج — إن لزم مطابقة طباعية مطلقة بدون الخط المضمّن |

تثبيت محلي (ماك / جسر `storage:sync`):

```bash
python3 -m venv scripts/pdf-tools-venv
scripts/pdf-tools-venv/bin/pip install pymupdf arabic-reshaper python-bidi
# احتياطي: assets/fonts/NotoNaskhArabic-Regular.ttf
```

على Netlify: عيّن `MAC_SYNC_URL` وشغّل الوكيل؛ المسار `POST /pdf-replace`. اختياري: `PDF_REPLACE_PYTHON`.

Sakkal Majalla غالباً مضمّن كمجموعة فرعية داخل لوائح Word→PDF؛ السكربت يستخرجه ويعيد الرسم به. بدون GSUB يعتمد على أشكال العرض (presentation forms). ملف الخط الكامل غير مُوزَّع مع المشروع (ترخيص Microsoft).

## سلسلة التحويل (`convert_document` / `convert_file`)

عند `engine: "auto"` (الافتراضي):

1. **Google Drive** — إن مربوط المستخدم وزوج الصيغ مدعوم (نفس العائلة):
   - Word/PDF/نص ↔ Google Docs ↔ `docx` / `pdf` / `txt`…
   - Excel/CSV ↔ Google Sheets ↔ `xlsx` / `pdf` / `csv`…
   - PowerPoint ↔ Google Slides ↔ `pptx` / `pdf`…
   - يُرفع ملف مؤقت → يُصدَّر → يُنقل لسلة المهملات (`drive.file`).
2. **CloudConvert** — إن `CLOUDCONVERT_API_KEY` مضبوط.
3. **إعادة بناء نصية** — `pdf` ↔ `docx` / `txt` / `md` فقط (بدون صور/تخطيط أصلي).
4. **خطأ عربي واضح** — يوجّه لربط Google أو إضافة المفتاح المدفوع.

فرض المحرّك: `engine: "google" | "cloudconvert" | "free" | "auto"`.

## اختياري مدفوع: CloudConvert

| المتغير | الوصف |
|---------|--------|
| `CLOUDCONVERT_API_KEY` | مفتاح API من [لوحة CloudConvert](https://cloudconvert.com/dashboard/api/v2/keys) |

- بدون المفتاح: لا شيء ينكسر — Google أو المسار النصّي.
- الواجهة: الإعدادات → تكاملات → قسم التحويل (Google أولاً، ثم CloudConvert).
- الحالة: `/api/integrations/status` → `googleDriveConvertHintAr` / `cloudConvertConfigured`

```bash
# Netlify Environment Variables (اختياري)
CLOUDCONVERT_API_KEY=…
```

## جسر الماك / Cua (اختياري)

- خزنة الماك + MarkItDown: قراءة عميقة PDF/Office → Markdown (`MAC_SYNC_URL`) — **ليس** محرّك تحويل صيغ.
- Cua: أتمتة سطح المكتب/Office محلياً إن لزم (`CUA_BRIDGE_URL`) — ليس داخل Netlify.

## أمثلة للوكيل

```json
{
  "fileId": "…",
  "toFormat": "docx",
  "engine": "auto"
}
```

```json
{
  "fileId": "…",
  "format": "docx",
  "replacements": [
    { "find": "الجمعية القديمة", "replace": "الجمعية الجديدة" }
  ]
}
```

```json
{
  "fileId": "…",
  "format": "docx",
  "templateData": { "memberName": "أحمد", "date": "2026-08-07" }
}
```
