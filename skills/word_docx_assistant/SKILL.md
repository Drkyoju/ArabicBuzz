---
name: word_docx_assistant
description: "إنشاء وتحرير مستندات Word (.docx): قراءة صفحة بصفحة، استبدال موضعي، تحويل ممتاز PDF↔Word، وإرجاع الملف كمرفق شات"
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
2. اقرأ بـ `read_document` (**صفحة بصفحة** عبر `pageStart` / `nextPageStart`) قبل أي تعديل — لا تقرأ مقتطفاً واحداً وتتجاهل الباقي.
3. للتعديل الموضعي مع الحفاظ على التنسيق: `edit_document` مع `replacements` — فضّل هذا على إعادة كتابة الملف بالكامل.
4. للتحويل PDF↔Word أو Word→PDF: `convert_document` / `convert_file` فقط عند الطلب الصريح.
   - **الجودة (مرتبة):** Google Drive (مجاني إن مربوط) ← CloudConvert (اختياري) ← جسر الماك مرئي (تخطيط 100%) ← **رفض** المسار النصّي عند ToUnicode معطوب (خطأ عربي صريح — بلا طلاسم).
   - Word المرئي (`_مرئي.docx`): تخطيط 100% · نص غير قابل للتحرير — أخبر المستخدم صراحة.
   - الناتج **مرفق في فقاعة الشات**: أزرار **معاينة** و**تنزيل** + «تم التعديل».
5. أعد الملف بـ `return_file` إن لم يتغيّر؛ إن كان من عقل الشركة احفظه بـ `brain_save_document` بعد الموافقة.

## ما يطلبه المستخدم لنص قابل للتحرير 100%
1. تسجيل الدخول في Arabic Buzz.
2. الإعدادات → **ربط Google (Drive)**.
3. طلب التحويل من الشات — `convert_document(engine=auto|google)`.

## قواعد
- لا تختلق أرقاماً رسمية (صادر، ترخيص، هوية).
- لا تحذف فقرات حساسة دون تأكيد.
- للعربية: حافظ على RTL؛ لا تعكس الحروف يدوياً؛ **ممنوع** pdf-lib لنص عربي في التحويل.
- عند الشك: اعرض Diff مختصر واطلب موافقة.
