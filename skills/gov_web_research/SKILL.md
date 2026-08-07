---
name: gov_web_research
description: "بحث مؤسسي من مصادر رسمية (gov.sa وويكيبيديا ومواقع موثوقة) مع استشهاد — دون اختلاق"
scope: shared
id: gov_web_research
author: "Arabic Buzz / adapted from mattpocock research + free web_search path"
toolsRequired:
  - web_search
  - web_fetch
  - ingest_url_to_brain
  - search_knowledge_base
---

# بحث من مصادر رسمية

استخدم عند: «ابحث في الأنظمة»، «ما تقول وزارة…»، «gov.sa»، لوائح، أو تحقق من معلومة حكومية/قطاع غير ربحي.

## الترتيب
1. `search_knowledge_base` أولاً — إن وُجد جواب موثّق استشهد به.
2. `web_search` مع تفضيل نطاقات رسمية (`site:gov.sa` وما شابه عبر الأداة المدمجة).
3. افتح الصفحات المهمة بـ `web_fetch`؛ إن طُلب حفظ دائم: `ingest_url_to_brain` بعد موافقة.
4. أخرج:
   - ملخص تنفيذي
   - نقاط مدعومة بـ [مصدر N]
   - قائمة روابط
   - ما لم يُؤكد («غير واضح في المصادر»)

## قواعد
- لا تختلق مواد قانونية أو تواريخ سريان.
- ميّز بين نص رسمي ورأي تحليلي.
- هذا ليس استشارة قانونية ملزمة.
