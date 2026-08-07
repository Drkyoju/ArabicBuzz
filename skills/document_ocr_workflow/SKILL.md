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

استخدم عند: «اقرأ الممسوح»، «OCR»، «استخرج النص من الصورة/PDF»، «ابحث داخل المسح الضوئي»، ملف بلا نص قابل للنسخ (يبدو ورقاً/صورة)، أو Word مرئي (صور صفحات).

## نعم — الصور وPDF القديم الممسوح

- **صورة png/jpg/webp/tiff في الغرفة:** `read_document` أو `arabic_ocr` — دائماً OCR (لا طبقة نسخ).
- **PDF قديم ممسوح:** إن فشل النسخ بالكيبورد (صفحات فارغة أو نص تافه) يكتشف النظام المسح ويشغّل OCR `ara+eng` صفحة بصفحة.
- الجودة **تعتمد على وضوح المسح** — لا تعد بالنص كمصدّق قانوني نهائي دون مراجعة.

## الخطوات (إلزامي — لا تتخطَّ صفحات)
1. حدّد الملف عبر `list_workspace_files` أو المرفق / تيليجرام. إن كان في Drive: `brain_open_document` أولاً.
2. اقرأ بـ `read_document` مع `pageStart=1` ثم كرّر باستخدام `nextPageStart` حتى `hasMore=false`. لا تلخّص من الصفحة الأولى فقط وتتجاهل الباقي.
3. إن ظهرت `warningAr` عن ممسوح / ToUnicode / نص فارغ: أبقِ `enableOcr=true` (افتراضي) أو استدعِ `arabic_ocr` مع `searchQuery` عند البحث عن عبارة.
4. للصور المفردة: `arabic_ocr` أو `read_document` مباشرة.
5. احفظ الناتج (افتراضي: ذاكرة الغرفة + ملف `.txt`) ولا تختلق سطوراً غير موجودة في الاستخراج.
6. إن طلب المستخدم صيغة أخرى بعد الاستخراج: `convert_document` — **فضّل Google Drive**؛ لا تستخدم المسار النصّي إن حذّر النظام من طلاسم.

## سلسلة OCR (مجانية قدر الإمكان)
1. جسر الماك: PyMuPDF + **Tesseract `ara+eng`** (`POST /pdf-page-ocr`)
2. Qari محلي / HuggingFace إن وُجد
3. Gemini vision على Netlify
4. officeparser/Tesseract إن `ENABLE_TESSERACT_OCR=true` محلياً

تثبيت الماك: `brew install tesseract tesseract-lang` ثم `npm run storage:sync` مع `MAC_SYNC_URL` على Netlify. التفاصيل: `docs/free-office-tools.md`.

## المخرجات
- ملخص قصير: ماذا استُخرج / هل وُجدت العبارة / اسم ملف النص / عدد الصفحات المقروءة / هل استُخدم OCR.
- مقتطفات قصيرة عند البحث؛ النص الكامل عبر الملف المحفوظ لا لصقه كاملاً في الشات إن كان طويلاً.
- نواقص: صفحات فارغة، جودة منخفضة، لغة مختلطة — اذكرها صراحة.

## قواعد
- لا ترسل النص عبر `mail_send` / `send_message` دون موافقة.
- لا تعتبر OCR مصدر حق قانوني نهائي — وثّق أنه استخراج آلي قد يحتاج مراجعة بشرية.
- **ممنوع** إعادة بناء Word من PDF معطوب ToUnicode دون تنبيه صريح أو مسار Drive/مرئي.
