# OCR على الماك — PaddleOCR عربي أولاً، ثم Tesseract

Arabic Buzz يفضّل مسار **مجاني** لقراءة PDF الممسوح / الصور:

1. **PaddleOCR عربي** (أساسي عند التوفر) — جسر الماك `POST /ocr/paddle` → `scripts/paddle-ocr.py` (PP-OCRv5 `arabic` إن وُجد، وإلا أفضل نموذج `ar`)
2. **Tesseract `ara+eng`** — `POST /pdf-page-ocr` إن Paddle ضعيف/غائب/فشل بوابة الجودة
3. إن تعذّر: Qari → Gemini (سحابي)

بديل بدون ماك: `PADDLE_OCR_URL` → `scripts/paddle-ocr-bridge.py` (لا تُضمَّن في صورة CranL الرقيقة).

الكود: `lib/rag/ocr.ts` · `lib/documents/read-pages.ts` · `scripts/paddle-ocr.py` · `scripts/pdf-page-ocr.py`

---

## تثبيت PaddleOCR على macOS (موصى به)

```bash
# Python 3.11 (paddlepaddle لا يدعم 3.14 بعد)
python3.11 -m venv scripts/paddle-ocr-venv
scripts/paddle-ocr-venv/bin/pip install -U pip
scripts/paddle-ocr-venv/bin/pip install paddlepaddle paddleocr pillow
# تحقق
scripts/paddle-ocr-venv/bin/python -c "import paddleocr; print('paddleok')"
```

ثم أعد تشغيل وكيل المزامنة (`npm run storage:sync` / hop watchdog).  
`GET /health` يجب أن يُظهر `"paddle": true`.

اختياري: `PADDLE_OCR_PYTHON=…/scripts/paddle-ocr-venv/bin/python` و`PADDLE_OCR_LANG=ar`.

---

## تثبيت Tesseract (احتياطي) على macOS (Homebrew)

```bash
brew install tesseract tesseract-lang
tesseract --list-langs   # يجب أن يظهر ara و eng
python3 -m pip install -r scripts/pdf-tools-requirements.txt
```

ثم شغّل وكيل المزامنة:

```bash
npm run storage:sync
# واضبط MAC_SYNC_URL + MAC_SYNC_SECRET على CranL
```

---

## إن فشل التثبيت على macOS 12 (Monterey)

Bottles الحديثة لـ Homebrew قد تستغرق طويلاً أو تفشل على Monterey (12.x). خيارات:

1. **انتظر اكتمال `brew install tesseract tesseract-lang`** — البناء من المصدر قد يستغرق 30–90 دقيقة.
2. **ثبّت لغة عربية يدوياً** إن وُجد `tesseract` بدون `ara`.
3. **بدون ماك:** اربط Google Drive للتحويل النظيف، أو اعتمد OCR السحابي (Gemini).

### حالة تم التحقق منها (macOS 12.7 Monterey · آب 2026)

`tesseract` + `ara`/`eng` عبر Homebrew · LibreOffice عبر cask · `scripts/pdf-tools-venv` · بعد `scripts/paddle-ocr-venv`: `/health` يُظهر `"paddle":true` و`"tesseract":true`.

#### متغيرات البيئة (لا تُرفع للأسرار في git)

| المتغير | أين | ملاحظة |
|---------|-----|--------|
| `MAC_SYNC_URL` | CranL env | يكفي لـ `/ocr/paddle` و`/pdf-page-ocr` |
| `MAC_SYNC_SECRET` | CranL + محلي | نفس السر؛ لا تُcommitt |
| `PADDLE_OCR_URL` | CranL اختياري | sidecar منفصل إن لم يُستخدم mac-hop |
| `PADDLE_OCR_SECRET` | اختياري | Bearer للـ sidecar |
| `ENABLE_PADDLE_OCR` | اختياري | `1` لتشغيل `paddle-ocr.py` محلياً |
| `PADDLE_OCR_LANG` | اختياري | افتراضي `ar` (يجرب `arabic` ثم `ar`) |
| `PADDLE_OCR_SKIP_MAC` | اختياري | `1` لتعطيل hop الماك لـ Paddle |
| `MAC_SYNC_PORT` | محلي اختياري | افتراضي `7420` |

```bash
npm run mac-hop:health
curl -sS http://127.0.0.1:7420/health | grep -E 'paddle|tesseract|libreoffice'
```

---

## سلوك المنتج

| الحالة | النتيجة |
|--------|---------|
| PDF بنص قابل للنسخ | قراءة مباشرة (بدون OCR) |
| PDF ممسوح / صورة صفحات | Paddle ثم Tesseract |
| صورة مرفقة | نفس السلسلة عبر الماك ثم السحابة |
| Paddle غير مثبت | تخطٍّ صادق → Tesseract ثم Qari/Gemini — بلا اختلاق نص |
