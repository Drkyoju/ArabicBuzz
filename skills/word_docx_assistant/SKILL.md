---
name: word_docx_assistant
description: "إنشاء وتحرير مستندات Word (.docx): قراءة، استبدال موضعي، تحويل، وإرجاع الملف"
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
4. للتحويل: `convert_document` (مثل PDF→docx أو العكس) عند الطلب الصريح فقط.
5. أعد الملف بـ `return_file`؛ إن كان من عقل الشركة احفظه بـ `brain_save_document` بعد الموافقة.

## قواعد
- لا تختلق أرقاماً رسمية (صادر، ترخيص، هوية).
- لا تحذف فقرات حساسة دون تأكيد.
- للعربية: حافظ على RTL المنطقي؛ لا تعكس الحروف يدوياً.
- عند الشك في نطاق التعديل: اعرض Diff مختصر (قبل/بعد) واطلب موافقة.
