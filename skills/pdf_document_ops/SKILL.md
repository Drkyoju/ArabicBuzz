---
name: pdf_document_ops
description: "عمليات PDF العامة: إنشاء، دمج، ختم، استبدال نص — غير تعبئة النماذج"
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
---

# عمليات مستندات PDF

استخدم عند: «أنشئ PDF»، «ادمج الملفات»، «اختم»، «استبدل نصاً في PDF»، وليس تعبئة حقول نموذج (تلك لمهارة `pdf_form_assistant`).

## الأدوات
| الحاجة | الأداة |
| إنشاء من نص عربي | `pdf_create` |
| دمج عدة ملفات | `pdf_merge` |
| ختم/علامة مائية خفيفة | `pdf_stamp` |
| استبدال نص في الطبقة النصية | `pdf_replace_text` |
| تحويل من/إلى صيغ أخرى | `convert_document` |

## قواعد
- اعرض خطة قصيرة (ملفات الدخل → العملية → الناتج) قبل التنفيذ إن كان دامجاً أو استبدالاً واسعاً.
- إن فشل استبدال النص (خط مضمّن/مسح): اقترح OCR أو التحويل لـ Word.
- لا تُسقط صفحات دون تأكيد عند الدمج الجزئي.
