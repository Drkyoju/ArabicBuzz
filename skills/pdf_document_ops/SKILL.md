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

## مصفوفة التحويل (جودة)
| الزوج | الأفضل | احتياطي | ممنوع |
| pdf↔docx | Google Drive | CloudConvert / Word مرئي (ماك) | rebuild نصّي عند ToUnicode معطوب |
| pdf↔pptx / pdf↔xlsx | Google أو CloudConvert | استخراج نص→إعادة بناء (جداول/شرائح فقط) | ادّعاء مطابقة تخطيط 100% |
| docx↔pdf | Google Drive | CloudConvert / مسار نصّي بسيط | pdf-lib لنسخ جسم عربي |
| xlsx→docx / docx→xlsx | Google أو استخراج منظم | free-rebuild من الصفحات/الأوراق | صمت عند فشل الاستخراج |

عند فشل الجودة: **خطأ عربي صريح** + اقتراح ربط Drive — لا طلاسم صامتة.

## قواعد
- اعرض خطة قصيرة قبل دمج/استبدال واسع.
- بعد التحويل: المرفق في فقاعة الشات (معاينة+تنزيل).
- لا تُسقط صفحات دون تأكيد عند الدمج الجزئي.
