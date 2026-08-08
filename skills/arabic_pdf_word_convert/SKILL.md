---
name: arabic_pdf_word_convert
description: "تحويل PDF↔Word عربي بلا طلاسم: Gemini Flash→أقوى → Paddle → توقّف (Mistral opt-in فقط) → رفض صادق"
scope: shared
id: arabic_pdf_word_convert
author: "Arabic Buzz — Gemini→Paddle→STOP (Mistral opt-in)"
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
- استدعاء Mistral تلقائياً بعد فشل Paddle.

## المسار الصحيح (`convert_document`, engine=auto)

1. **Gemini Flash OCR/vision** → نص نظيف → إعادة بناء DOCX بـ RTL.
2. إن فشل بوابة الجودة → **Gemini أقوى** (مثل `gemini-3.1-pro`).
3. **PaddleOCR** إن وُجد `PADDLE_OCR_URL` / `ENABLE_PADDLE_OCR`.
4. **توقّف** — لا Mistral تلقائي. Mistral فقط إن `CONVERT_ALLOW_MISTRAL=1` **و** `MISTRAL_API_KEY` (افتراضي OFF).
5. **استخراج محلي نظيف** (`pdf-parse-safe` / صفحات) **فقط** إن اجتاز بوابة الجودة.
6. وإلا → `{ ok: false, reason_ar }` بدون مرفق، برسالة مثل:
   «تعذّر التحويل بنص عربي نظيف (Gemini ثم Paddle). لم نُنشئ ملفاً حتى لا يصلك طلاسم. إن رغبت لاحقاً بتجربة Mistral OCR أخبرني، أو أوقف التحويل لهذا الملف.»
7. افحص الناتج مجدداً — إن وُجدت طلاسم → رفض، لا مرفق.

## بوابة الجودة تلتقط
- الالئحة، األساسية، املادة، U+FFFD، mojibake لاتيني (Ã./Ø./Ù.)، طبقة ToUnicode معطوبة.

## أدوات خارجية
| أداة | دورها هنا | ملاحظة |
|------|----------|--------|
| Gemini | OCR/vision أول المسار (Flash ثم أقوى) | مفتاح موجود عادة |
| PaddleOCR | بعد فشل بوابة Gemini | اختياري عبر URL/ENABLE — لا في صورة CranL الرقيقة |
| Mistral OCR | اختيار صريح لاحق | `CONVERT_ALLOW_MISTRAL=1` + `MISTRAL_API_KEY` معاً — افتراضي OFF |
| LibreOffice | Word↔PDF | إن وُجد soffice |
| pdf2docx | **معطّل للعربية** | لا تستخدمه |
| Google Drive | اختياري بـ engine=google + بوابة | التصدير المعطوب يُرفض |

## صدق الجودة
- **النص:** هدف ≈100٪ بلا طلاسم (مثل «اللائحة الأساسية»).
- **التخطيط 100٪ حرفاً بحرف:** غير مضمون مجاناً — قل ذلك بصدق.
- عند الشك: ارفض. لا تُرسل ملفاً جزئياً دون تحذير صريح في الرسالة والاسم.
