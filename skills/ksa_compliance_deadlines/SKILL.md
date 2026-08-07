---
name: ksa_compliance_deadlines
description: "متابعة مواعيد الامتثال للجمعيات في السعودية: ترخيص، عمومية، تقرير سنوي وتنبيهات"
scope: shared
id: ksa_compliance_deadlines
author: "Arabic Buzz / KSA association ops + room system-deadlines (free in-repo)"
toolsRequired:
  - room_calendar_list
  - room_calendar_create
  - room_calendar_update
  - room_tasks_list
  - room_tasks_create
  - send_message
  - search_knowledge_base
---

# مواعيد الامتثال (السعودية / الجمعيات)

استخدم عند: «مواعيد نظامية»، «انتهاء الترخيص»، «الجمعية العمومية»، «التقرير السنوي»، «compliance deadlines»، أو تذكير امتثال.

## الأنواع المدعومة في التقويم المشترك
عند إنشاء/تحديث موعد نظامي عبر `room_calendar_create` / `room_calendar_update` استخدم عناوين واضحة و`meta` إن دعمته الأداة:
- `license_expiry` — انتهاء ترخيص الجمعية
- `general_assembly` — الجمعية العمومية
- `annual_report` — التقرير السنوي

التواريخ: يوم كامل بتوقيت الرياض (YYYY-MM-DD). اقترح تذكيرات 30 / 14 / 7 / 1 يوماً.

## التدفق
1. اقرأ المواعيد الحالية: `room_calendar_list` (+ مهام `room_tasks_list`).
2. إن طلب المستخدم تسجيل موعد: أنشئ/حدّث على تقويم الغرفة — لا تؤكد تاريخاً قانونياً من عندك.
3. ابنِ لوحة:
   | الموعد | التاريخ | متبقي (أيام) | الحالة | الخطوة التالية | المسؤول |
4. للمهام التحضيرية (مستندات، دعوات، رفع تقرير): اقترح `room_tasks_create` بعد موافقة.
5. للتنبيه: نص مختصر لـ `send_message` (telegram) بعد موافقة — دون أسرار.

## قواعد مهمة
- **لا تختلق** مواعيد نظامية أو مواد قانونية — اطلب التاريخ من المستخدم أو من مستند في المعرفة (`search_knowledge_base`).
- هذا تذكير تشغيلي وليس استشارة نظامية ملزِمة؛ عند الشك أشر لمراجعة مختص / المركز الوطني أو الجهة المختصة.
- فضّل تقويم الغرفة على تقويم Google الشخصي.
