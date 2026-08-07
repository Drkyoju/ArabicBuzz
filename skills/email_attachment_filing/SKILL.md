---
name: email_attachment_filing
description: "أرشفة مرفقات البريد إلى مساحة الغرفة أو عقل الشركة مع تسمية عربية موحّدة"
scope: shared
id: email_attachment_filing
author: "Arabic Buzz / adapted from googleworkspace recipe-save-email-attachments (free)"
toolsRequired:
  - mail_search
  - mail_read
  - gmail_search
  - gmail_read
  - list_workspace_files
  - read_document
  - convert_document
  - brain_save_document
  - drive_sync_brain
  - arabic_ocr
---

# أرشفة مرفقات البريد

استخدم عند: «احفظ المرفقات»، «أرشف ملفات الإيميل»، «انقل PDF من البريد لـ Drive»، أو حفظ عقود/فواتير وصلت بالبريد.

## الخطوات
1. ابحث عن الرسائل ذات المرفقات (`mail_search`/`gmail_search`) واقرأها.
2. اعرض قائمة المرفقات: الاسم · النوع · الحجم التقريبي · الرسالة المصدر.
3. اقترح أسماء عربية موحّدة (مثل `2026-08-07_فاتورة_مورد-س.pdf`) قبل الحفظ.
4. احفظ في مساحة الغرفة عند التوفر؛ لـ Drive/عقل الشركة استخدم `brain_save_document` / `drive_sync_brain` بعد موافقة.
5. للممسوح بلا نص: شغّل `arabic_ocr` ثم احفظ النص المستخرج مع الملف إن طُلب.

## قواعد
- لا تحذف الرسالة الأصلية.
- لا ترفع مرفقات مشبوهة (تنفيذي، ماكرو) دون تحذير صريح.
- لا تختلق محتوى المرفق — إن فشل الاستخراج صرّح بذلك.
