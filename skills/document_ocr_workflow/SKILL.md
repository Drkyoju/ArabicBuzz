---
name: document_ocr_workflow
description: "استخراج نص عربي+إنجليزي من صور وPDF/Word مرئي: OCR صفحة بصفحة، بحث، حفظ في الغرفة"
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

استخدم عند: «اقرأ الممسوح»، «OCR»، «استخرج النص من الصورة/PDF»، «ابحث داخل المسح الضوئي»، أو ملف بلا نص قابل للنسخ، أو Word مرئي (صور صفحات).

## الخطوات (إلزامي — لا تتخطَّ صفحات)
1. حدّد الملف عبر `list_workspace_files` أو المرفق / تيليجرام. إن كان في Drive: `brain_open_document` أولاً.
2. اقرأ بـ `read_document` مع `pageStart=1` ثم كرّر باستخدام `nextPageStart` حتى `hasMore=false`. لا تلخّص من الصفحة الأولى فقط وتتجاهل الباقي.
3. إن ظهرت `warningAr` عن ToUnicode معطوب أو نص فارغ: فعّل OCR (`enableOcr=true` افتراضي) أو `arabic_ocr` مع `searchQuery` عند البحث عن عبارة.
4. للصور المفردة: `arabic_ocr` مباشرة.
5. احفظ الناتج (افتراضي: ذاكرة الغرفة + ملف `.txt`) ولا تختلق سطوراً غير موجودة في الاستخراج.
6. إن طلب المستخدم صيغة أخرى بعد الاستخراج: `convert_document` — **فضّل Google Drive**؛ لا تستخدم المسار النصّي إن حذّر النظام من طلاسم.

## سلسلة OCR (مجانية قدر الإمكان)
Qari محلي → HuggingFace Qari → Gemini → جسر الماك (PyMuPDF + Tesseract `ara+eng`) → officeparser/Tesseract إن `ENABLE_TESSERACT_OCR=true`.

## المخرجات
- ملخص قصير: ماذا استُخرج / هل وُجدت العبارة / اسم ملف النص / عدد الصفحات المقروءة.
- مقتطفات قصيرة عند البحث؛ النص الكامل عبر الملف المحفوظ لا لصقه كاملاً في الشات إن كان طويلاً.
- نواقص: صفحات فارغة، جودة منخفضة، لغة مختلطة — اذكرها صراحة.

## قواعد
- لا ترسل النص عبر `mail_send` / `send_message` دون موافقة.
- لا تعتبر OCR مصدر حق قانوني نهائي — وثّق أنه استخراج آلي قد يحتاج مراجعة بشرية.
- **ممنوع** إعادة بناء Word من PDF معطوب ToUnicode دون تنبيه صريح أو مسار Drive/مرئي.
