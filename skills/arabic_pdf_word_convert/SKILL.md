---
name: arabic_pdf_word_convert
description: "تحويل PDF↔Word عربي بلا طلاسم: بوابة جودة، إعادة بناء نظيفة، رفض المسارات المعطوبة"
scope: shared
id: arabic_pdf_word_convert
author: "Arabic Buzz — free clean-or-refuse (pdf-parse-safe + OCR + gated Drive)"
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
- الاعتماد على تصدير Google Drive Docs عندما تفشل بوابة الجودة.
- `pdf2docx` للعربية (LTR فقط — معروف أنه يكسر العربية).
- `pdf-lib` لجسم عربي Word→PDF.
- `forceBrokenRebuild` / قبول نص معطوب.

## المسار الصحيح (`convert_document`, engine=auto)
1. جرّب Drive **فقط** إن اجتاز بوابة العربية → وإلا **ارفض الناتج بالكامل**.
2. استخرج أفضل نص نظيف: `pdf-parse-safe` ثم صفحات، ثم OCR (Gemini/Qari/ماك) إن لزم.
3. أعد بناء DOCX بفقرات RTL وعناوين (المادة/الباب/اللائحة).
4. افحص الناتج مجدداً — إن وُجدت طلاسم → خطأ عربي صريح، لا مرفق.

## أدوات خارجية مجانية (بحث 2026)
| أداة | دورها هنا | ملاحظة |
| MarkItDown MCP | PDF→Markdown للقراءة | ليس بديلاً عن DOCX عالي الدقة |
| Docling | جداول/مسح ثقيل | ثقيل؛ اختياري لاحقاً عبر MCP stub |
| LibreOffice | Word↔PDF | إن وُجد soffice على المضيف |
| pdf2docx | **معطّل للعربية** | لا تستخدمه |
| CloudConvert | اختياري مدفوع | لا مفاتيح مخترعة — فقط إن ضبط المستخدم المفتاح |

إعداد MCP اختياري: `docs/mcp-document-convert.stub.json`.

## صدق الجودة
- **النص:** هدف ≈100٪ بلا طلاسم (كلمات صحيحة مثل «اللائحة الأساسية»).
- **التخطيط+كل التشكيل حرفاً بحرف مقابل PDF الأصلي:** غير مضمون مجاناً.

بعد التحويل: أظهر المرفق في الشات عبر الناتج القياسي / `return_file`.
