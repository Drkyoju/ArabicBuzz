---
name: calendar_email_ingest
description: "استخراج مواعيد من البريد وإضافتها لتقويم الغرفة أو Google بعد مراجعة"
scope: shared
id: calendar_email_ingest
author: "Arabic Buzz / adapted from gws-calendar + calendar_scan_email patterns (free)"
toolsRequired:
  - mail_search
  - mail_read
  - gmail_search
  - gmail_read
  - calendar_scan_email
  - calendar_list_events
  - room_calendar_list
  - room_calendar_create
  - room_calendar_ingest
  - calendar_create_event
  - calendar_find_duplicates
---

# استيعاب مواعيد من البريد

استخدم عند: «استخرج المواعيد من الإيميل»، «أضف دعوة البريد للتقويم»، أو مسح بريد الاجتماعات.

## الخطوات
1. ابحث عن رسائل الدعوات/التذكيرات.
2. استخدم `calendar_scan_email` أو `room_calendar_ingest` عند التوفر؛ وإلا استخرج يدوياً من نص الرسالة.
3. اعرض المرشحين: العنوان · البداية · النهاية · المكان · المصدر.
4. افحص التكرار بـ `calendar_find_duplicates` / `room_calendar_list`.
5. أنشئ الحدث فقط بعد موافقة (`room_calendar_create` أو `calendar_create_event`).

## قواعد
- المنطقة الزمنية الافتراضية: Asia/Riyadh ما لم يُحدد غير ذلك.
- لا تؤكد حضوراً خارجياً نيابة عن المستخدم.
- تجاهل نشرات بلا زمن واضح.
