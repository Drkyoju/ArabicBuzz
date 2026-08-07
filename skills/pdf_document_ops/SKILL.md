---
name: pdf_document_ops
description: "عمليات PDF العامة: إنشاء، دمج، ختم، استبدال نص، وتحويل ممتاز PDF↔Word — غير تعبئة النماذج"
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

استخدم عند: «أنشئ PDF»، «ادمج الملفات»، «اختم»، «استبدل نصاً في PDF»، «حوّل إلى Word»، وليس تعبئة حقول نموذج (تلك لمهارة `pdf_form_assistant`).

## الأدوات
| الحاجة | الأداة |
| إنشاء من نص عربي | `pdf_create` |
| دمج عدة ملفات | `pdf_merge` |
| ختم/علامة مائية خفيفة | `pdf_stamp` |
| استبدال نص في الطبقة النصية | `pdf_replace_text` |
| تحويل من/إلى Word أو صيغ أخرى | `convert_document` / `convert_file` |

## تحويل PDF ↔ Word (ممتاز — إلزامي)

1. **الأفضل مجاناً:** `convert_document(engine=auto|google)` عبر **Google Drive** إن مربوط المستخدم — يحافظ على العربية/RTL أفضل من المسار النصّي.
2. **احتياطي مدفوع:** CloudConvert إن `CLOUDCONVERT_API_KEY` مضبوط.
3. **تجنّب** إعادة البناء النصية (`engine=free`) لـ PDF عربي بخط مضمّن (Sakkal Majalla وغيرها) عندما تكون طبقة ToUnicode معطوبة — تنتج **طلاسم** رغم أن الصفحة تبدو صحيحة بصرياً.
4. **ممنوع** استخدام `pdf-lib` / `pdf_stamp` لنسخ جسم عربي أو كمحرّك تحويل.
5. بعد التحويل: الناتج يُحفظ بمساحة الغرفة **ويظهر كمرفق في فقاعة الشات** بأزرار **معاينة** + **تنزيل** ووسم «تم التعديل». لا تكتفِ بالإشارة إلى «ملفات الفريق».
6. إن طُلب Word→PDF: نفس السلسلة `convert_document(toFormat=pdf)`.

## قواعد
- اعرض خطة قصيرة (ملفات الدخل → العملية → الناتج) قبل التنفيذ إن كان دامجاً أو استبدالاً واسعاً.
- إن فشل استبدال النص (خط مضمّن/مسح): اقترح OCR أو التحويل لـ Word عبر Drive.
- لا تُسقط صفحات دون تأكيد عند الدمج الجزئي.
