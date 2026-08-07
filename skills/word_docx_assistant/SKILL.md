---
name: word_docx_assistant
description: "إنشاء وتحرير مستندات Word (.docx): قراءة، استبدال موضعي، تحويل ممتاز PDF↔Word، وإرجاع الملف كمرفق شات"
scope: shared
id: word_docx_assistant
author: "Arabic Buzz / adapted from anthropics/skills docx + in-repo edit_document (Apache/MIT-style)"
toolsRequired:
  - list_workspace_files
  - read_document
  - edit_document
  - convert_document
  - return_file
  - brain_open_document
  - brain_save_document
---

# مساعد Word (.docx)

استخدم عند: «عدّل الوورد»، «أنشئ مستند Word»، «docx»، خطاب/محضر بصيغة Word، أو تحويل PDF↔Word.

## التدفق
1. حدّد الملف عبر `list_workspace_files` أو المرفق أو `brain_open_document`.
2. اقرأ بـ `read_document` قبل أي تعديل.
3. للتعديل الموضعي مع الحفاظ على التنسيق: `edit_document` مع `replacements` (بحث/استبدال) — فضّل هذا على إعادة كتابة الملف بالكامل.
4. للتحويل PDF↔Word أو Word→PDF: `convert_document` / `convert_file` فقط عند الطلب الصريح.
   - **الجودة:** Google Drive (مجاني إن مربوط) ← CloudConvert (اختياري) ← جسر الماك مرئي (تخطيط 100%) ← تجنّب المسار النصّي لـ PDF عربي بطبقة ToUnicode معطوبة.
   - الناتج **مرفق في فقاعة الشات**: أزرار **معاينة** و**تنزيل** + «تم التعديل». المستخدم لا يحتاج الذهاب إلى ملفات الفريق للتنزيل.
5. أعد الملف بـ `return_file` إن لم يتغيّر؛ إن كان من عقل الشركة احفظه بـ `brain_save_document` بعد الموافقة (أرشفة إضافية — الشات يبقى مصدر التنزيل الأساسي).

## قواعد
- لا تختلق أرقاماً رسمية (صادر، ترخيص، هوية).
- لا تحذف فقرات حساسة دون تأكيد.
- للعربية: حافظ على RTL المنطقي؛ لا تعكس الحروف يدوياً؛ لا تستخدم pdf-lib لنص عربي.
- عند الشك في نطاق التعديل: اعرض Diff مختصر (قبل/بعد) واطلب موافقة.
