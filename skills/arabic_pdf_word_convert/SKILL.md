---
name: arabic_pdf_word_convert
description: "تحويل PDF↔Word عربي بلا طلاسم: Gemini Flash→أقوى → Paddle (أرخص من Mistral؛ الجودة ليست دائماً أقوى) → Mistral اختياري → رفض صادق"
scope: shared
id: arabic_pdf_word_convert
author: "Arabic Buzz — Gemini→Paddle→Mistral→clean-or-refuse"
toolsRequired:
  - convert_document
  - read_document
  - arabic_ocr
  - return_file
  - list_workspace_files
---

# تحويل PDF ↔ Word عربي (نظيف أو ارفض)

## مطلقاً ممنوع
- تسليم «الالئحة / األساسية / U+FFFD» أو أي طلاسم.
- إرفاق ملف يبدو سليماً وهو فاسد (كذب على المستخدم).
- `pdf2docx` للعربية (LTR فقط — معروف أنه يكسر العربية).
- `pdf-lib` لجسم عربي Word→PDF.
- تصدير Drive المعطوب / `forceBrokenRebuild`.

## المسار الصحيح (`convert_document`, engine=auto)

1. **Gemini Flash OCR/vision** → نص نظيف → إعادة بناء DOCX بـ RTL.
2. إن فشل بوابة الجودة → **Gemini أقوى** (مثل `gemini-3.1-pro`).
3. **PaddleOCR** إن وُجد `PADDLE_OCR_URL` / `ENABLE_PADDLE_OCR` — **أرخص من Mistral** عند التثبيت الذاتي؛ **الجودة ليست دائماً أقوى**.
4. **Mistral OCR** فقط إن وُجد `MISTRAL_API_KEY` وما زال النص غير نظيف بعد Paddle (لا تختلق مفاتيح).
5. **استخراج محلي نظيف** (`pdf-parse-safe` / صفحات) **فقط** إن اجتاز بوابة الجودة.
6. وإلا → `{ ok: false, reason_ar: "…" }` بدون مرفق — أخبر المستخدم بصراحة بالعربية.
7. افحص الناتج مجدداً — إن وُجدت طلاسم → رفض، لا مرفق.

## بوابة الجودة تلتقط
- الالئحة، األساسية، املادة، U+FFFD، mojibake لاتيني (Ã./Ø./Ù.)، طبقة ToUnicode معطوبة.

## أدوات خارجية
| أداة | دورها هنا | ملاحظة |
| Gemini | OCR/vision أول المسار (Flash ثم أقوى) | مفتاح موجود عادة |
| PaddleOCR | أرخص من Mistral؛ الجودة ليست دائماً أقوى | اختياري عبر URL/ENABLE — لا في صورة CranL الرقيقة |
| Mistral OCR | آخر API مدفوع اختياري بعد Paddle | فقط مع `MISTRAL_API_KEY` |
| LibreOffice | Word↔PDF | إن وُجد soffice |
| pdf2docx | **معطّل للعربية** | لا تستخدمه |
| Google Drive | اختياري بـ engine=google + بوابة | التصدير المعطوب يُرفض |

## صدق الجودة
- **النص:** هدف ≈100٪ بلا طلاسم (مثل «اللائحة الأساسية»).
- **التخطيط 100٪ حرفاً بحرف:** غير مضمون مجاناً — قل ذلك بصدق.
- عند الشك: ارفض. لا تُرسل ملفاً جزئياً دون تحذير صريح في الرسالة والاسم.

بعد التحويل الناجح فقط: أظهر المرفق عبر الناتج القياسي / `return_file`.
