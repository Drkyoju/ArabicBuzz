# محركات تعديل الملفات (Office / PDF)

مسار مجاني يعمل على Netlify بدون مفاتيح مدفوعة. CloudConvert اختياري مدفوع للدقة الأعلى.

## ما هو جاهز الآن

| الصيغة | قراءة | إنشاء | تعديل مع الحفاظ على البنية | ملاحظات |
|--------|-------|--------|---------------------------|---------|
| **DOCX** | mammoth / officeparser | `docx` | `edit_document(replacements)` أو `templateData` | استبدال OOXML عبر JSZip؛ قوالب `{tag}` عبر docxtemplater |
| **XLSX** | exceljs | exceljs | `edit_excel(cells)` | يحافظ على الأوراق والأنماط |
| **PDF** | pdf-parse + OCR | pdf-lib | `pdf_stamp` / `pdf_merge` / `pdf_fill_form` / `edit_document` | إنشاء عربي عبر Noto |
| **PPTX** | officeparser | pptxgenjs | `edit_document(replacements)` | أو `slides` لإعادة بناء نصية |

أدوات الشات: `read_document` → `edit_document` / `edit_excel` / `pdf_*` → زر تنزيل (`return_file` إن لزم).

## مسار مجاني (افتراضي)

1. **استبدال موضعي Word/PowerPoint** — `edit_document` مع `fileId` + `replacements: [{ find, replace }]`
2. **قوالب** — ملف فيه `{name}` ثم `templateData: { name: "…" }` (docxtemplater + pizzip)
3. **Excel خلايا** — `edit_excel`
4. **تحويل PDF↔Word** — `convert_document` بإعادة بناء نصية عربية (بدون صور/تخطيط أصلي)

مكتبات OSS: `docx` · `mammoth` · `exceljs` · `pdf-lib` · `pptxgenjs` · `jszip` · `docxtemplater` · `pizzip` · `officeparser`

## اختياري مدفوع: CloudConvert

| المتغير | الوصف |
|---------|--------|
| `CLOUDCONVERT_API_KEY` | مفتاح API من [لوحة CloudConvert](https://cloudconvert.com/dashboard/api/v2/keys) |

- بدون المفتاح: لا شيء ينكسر — يبقى المسار المجاني.
- مع المفتاح: `convert_document` يفضّل CloudConvert تلقائياً (تخطيط/صور أفضل؛ يدعم xlsx/pptx/doc…).
- الواجهة: الإعدادات → «اختياري مدفوع» تحت CloudConvert.
- الحالة: `/api/integrations/status` → `cloudConvertConfigured` / `cloudConvertStatusAr`

```bash
# Netlify Environment Variables
CLOUDCONVERT_API_KEY=…
```

فرض المحرّك من الأداة: `engine: "free" | "cloudconvert" | "auto"`.

## جسر الماك / Cua (اختياري)

- خزنة الماك + MarkItDown: قراءة عميقة PDF/Office → Markdown (`MAC_SYNC_URL`).
- Cua: أتمتة سطح المكتب/Office محلياً إن لزم (`CUA_BRIDGE_URL`) — ليس داخل Netlify.

## أمثلة للوكيل

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
