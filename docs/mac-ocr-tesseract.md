# OCR على الماك — Tesseract عربي+إنجليزي

Arabic Buzz يفضّل مسار **مجاني** لقراءة PDF الممسوح / الصور:

1. جسر الماك (`MAC_SYNC_URL`) → `POST /pdf-page-ocr` → PyMuPDF + **Tesseract `ara+eng`**
2. إن تعذّر: Gemini / Qari (سحابي)

الكود: `lib/documents/scanned-detect.ts` · `lib/documents/read-pages.ts` · `scripts/pdf-page-ocr.py`

---

## تثبيت على macOS (Homebrew)

```bash
brew install tesseract tesseract-lang
tesseract --list-langs   # يجب أن يظهر ara و eng
python3 -m pip install -r scripts/pdf-tools-requirements.txt
```

ثم شغّل وكيل المزامنة:

```bash
npm run storage:sync
# واضبط MAC_SYNC_URL + MAC_SYNC_SECRET على Netlify
```

---

## إن فشل التثبيت على macOS 12 (Monterey)

Bottles الحديثة لـ Homebrew قد تستغرق طويلاً أو تفشل على Monterey (12.x). خيارات:

1. **انتظر اكتمال `brew install tesseract tesseract-lang`** — البناء من المصدر قد يستغرق 30–90 دقيقة.
2. **ثبّت لغة عربية يدوياً** إن وُجد `tesseract` بدون `ara`:
   ```bash
   # بعد تثبيت tesseract الأساسي
   brew install tesseract-lang
   # أو انسخ ara.traineddata إلى مجلد tessdata
   ```
3. **بدون ماك:** اربط Google Drive للتحويل النظيف، أو اعتمد OCR السحابي (Gemini) — يعمل لكن ليس مجانياً بالكامل على الحجم الكبير.

تحقق سريع:

```bash
which tesseract
tesseract --list-langs | grep -E 'ara|eng'
echo 'test' | tesseract stdin stdout -l eng
```

---

## سلوك المنتج

| الحالة | النتيجة |
|--------|---------|
| PDF بنص قابل للنسخ | قراءة مباشرة (بدون OCR) |
| PDF ممسوح / صورة صفحات | كشف تلقائي → OCR صفحة بصفحة (حتى 8 صفحات/طلب) |
| صورة مرفقة | OCR عبر الماك ثم السحابة |

لا يُحذف أرشيف «ملفات الفريق» مع تنظيف الشات — OCR يعمل على الملفات المخزّنة في الخزنة.
