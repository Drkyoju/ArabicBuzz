---
name: pdf_document_ops
description: "عمليات PDF: إنشاء، دمج، ختم، استبدال نص، قراءة صفحة بصفحة، وتحويل ممتاز PDF↔Word/PPTX/XLSX"
scope: shared
id: pdf_document_ops
author: "Arabic Buzz / adapted from anthropics/skills pdf + in-repo pdf_* tools (free)"
toolsRequired:
  - list_workspace_files
  - pdf_create
  - pdf_merge
  - pdf_stamp
  - pdf_replace_text
  - read_document
  - convert_document
  - return_file
  - arabic_ocr
---

# عمليات مستندات PDF

استخدم عند: «أنشئ PDF»، «ادمج»، «اختم»، «استبدل نصاً»، «حوّل إلى Word/Excel/PPT»، وليس تعبئة نماذج (`pdf_form_assistant`).

## قراءة كاملة (إلزامي)
- `read_document(fileId, pageStart=1)` ثم كرّر `nextPageStart` حتى `hasMore=false`.
- **PDF ممسوح / صورة:** إن لم يمكن نسخ النص (ورق/مسح) يكتشف النظام ذلك ويشغّل OCR `ara+eng` تلقائياً — أو `arabic_ocr`.
- لا تلخّص من أول 3 صفحات وتتجاهل الباقي. التفاصيل: `docs/free-office-tools.md`.

## الأدوات
| الحاجة | الأداة |
| إنشاء من نص عربي | `pdf_create` |
| دمج | `pdf_merge` |
| ختم خفيف | `pdf_stamp` |
| استبدال نص عربي في الطبقة | `pdf_replace_text` (خط مضمّن / HarfBuzz — ليس stamp) |
| تحويل صيغ | `convert_document` |

## مصفوفة التحويل (جودة — نظيف أو ارفض)
| الزوج | المسموح | معطّل |
| pdf→docx | `convert_document` auto: نص نظيف (pdf-parse-safe/OCR) → DOCX RTL؛ Drive فقط بعد بوابة الجودة | Drive طلاسم، pdf2docx عربي، rebuild معطوب |
| docx→pdf | Drive بجودة نظيفة أو LibreOffice أو CloudConvert (مدفوع اختياري) | pdf-lib جسم عربي |
| pdf↔xlsx/pptx | نفس مصدر النص النظيف فقط | أي مسار يمرّر طلاسم |

عند فشل الجودة: **خطأ عربي صريح** — لا مرفق فاسد. التفاصيل: `skills/arabic_pdf_word_convert/SKILL.md`.

## قواعد
- اعرض خطة قصيرة قبل دمج/استبدال واسع.
- بعد التحويل: المرفق في فقاعة الشات (معاينة+تنزيل).
- لا تُسقط صفحات دون تأكيد عند الدمج الجزئي.
