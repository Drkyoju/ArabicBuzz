---
name: document_ocr_workflow
description: "استخراج نص عربي من صور وPDF ممسوح: OCR، بحث داخل النص، حفظ في الغرفة"
scope: shared
id: document_ocr_workflow
author: "Arabic Buzz / adapted from yejinlei pdf-ocr-skill + claude-office-skills pdf-ocr patterns (free)"
toolsRequired:
  - arabic_ocr
  - list_workspace_files
  - read_document
  - convert_document
  - brain_open_document
---

# سير عمل OCR للمستندات

استخدم عند: «اقرأ الممسوح»، «OCR»، «استخرج النص من الصورة/PDF»، «ابحث داخل المسح الضوئي»، أو ملف بلا نص قابل للنسخ.

## الخطوات
1. حدّد الملف عبر `list_workspace_files` أو المرفق / تيليجرام. إن كان في Drive: `brain_open_document` أولاً.
2. للمستندات المكتبية القابلة للاستخراج: جرّب `read_document` أولاً (فيه OCR تلقائي للصفحات الممسوحة).
3. للصور أو PDF الممسوح بالكامل أو عند طلب بحث عبارة: استخدم `arabic_ocr` مع `fileId` و`searchQuery` عند الحاجة.
4. احفظ الناتج (افتراضي: ذاكرة الغرفة + ملف `.txt`) ولا تختلق سطوراً غير موجودة في الاستخراج.
5. إن طلب المستخدم صيغة أخرى بعد الاستخراج: `convert_document` — لا تحوّل دون طلب.

## المخرجات
- ملخص قصير: ماذا استُخرج / هل وُجدت العبارة / اسم ملف النص.
- مقتطفات قصيرة عند البحث؛ النص الكامل عبر الملف المحفوظ لا لصقه كاملاً في الشات إن كان طويلاً.
- نواقص: صفحات فارغة، جودة منخفضة، لغة مختلطة — اذكرها صراحة.

## قواعد
- لا ترسل النص عبر `mail_send` / `send_message` دون موافقة.
- لا تعتبر OCR مصدر حق قانوني نهائي — وثّق أنه استخراج آلي قد يحتاج مراجعة بشرية.
