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

### حالة تم التحقق منها (macOS 12.7 Monterey · آب 2026)

على جهاز التطوير الحالي **لم يُحظر brew**: `tesseract 5.5.3` + `tesseract-lang 4.1.0` مثبتان عبر Homebrew، و`tesseract --list-langs` يظهر **ara** و **eng**. **LibreOffice 26.2.5** مثبت عبر `brew install --cask libreoffice` (`soffice` → `/Applications/LibreOffice.app/...`). venv: `scripts/pdf-tools-venv` مع `pytesseract` + `pymupdf`. الوكيل: `npm run storage:sync` على المنفذ 7420 — `/health` يُظهر `tesseract:true` و`libreoffice:true`.

#### متغيرات البيئة (لا تُرفع للأسرار في git)

| المتغير | أين | ملاحظة |
|---------|-----|--------|
| `MAC_SYNC_URL` | CranL env | رابط نفق الماك العام (cloudflared / localtunnel / ngrok) بدون شرطة نهاية |
| `MAC_SYNC_SECRET` | CranL + محلي عند تشغيل الوكيل | نفس السر في الطرفين؛ لا تُcommitt |
| `MAC_SYNC_PORT` | محلي اختياري | افتراضي `7420` |
| `TELEGRAM_BOT_API_URL` | CranL | نفق Local Bot API إن وُجد (ملفات كبيرة) |

```bash
npm run mac-hop:health          # hop_health=ok
npm run mac-hop:watchdog:force  # يعيد النفق ويحدّث CranL عند الحاجة
curl -sS "$MAC_SYNC_URL/health" | grep -E 'tesseract|libreoffice'
```

النفق العام قد يفشل حسب الشبكة:

| النفق | ملاحظة |
|--------|---------|
| `cloudflared` quick tunnel | قد يفشل إن حُظر QUIC/TCP إلى Cloudflare (منفذ 7844) |
| `npx localtunnel --port 7420` | يعمل غالباً؛ انسخ الرابط إلى `MAC_SYNC_URL` + نفس `MAC_SYNC_SECRET` على Netlify ثم Redeploy |
| `npx ngrok http 7420` | يحتاج حساب/توكن ngrok إن طُلب |

تحقق سريع:

```bash
which tesseract
tesseract --list-langs | grep -E 'ara|eng'
# صورة اختبار عبر Python (stdin النصي لـ tesseract غير موثوق على كل الإصدارات):
scripts/pdf-tools-venv/bin/python -c "from PIL import Image,ImageDraw; import pytesseract; i=Image.new('RGB',(120,40),'white'); ImageDraw.Draw(i).text((5,10),'hi'); print(pytesseract.image_to_string(i, lang='eng'))"
curl -sS http://127.0.0.1:7420/health | grep -o '"tesseract":true'
```

---

## سلوك المنتج

| الحالة | النتيجة |
|--------|---------|
| PDF بنص قابل للنسخ | قراءة مباشرة (بدون OCR) |
| PDF ممسوح / صورة صفحات | كشف تلقائي → OCR صفحة بصفحة (حتى 8 صفحات/طلب) |
| صورة مرفقة | OCR عبر الماك ثم السحابة |

لا يُحذف أرشيف «ملفات الفريق» مع تنظيف الشات — OCR يعمل على الملفات المخزّنة في الخزنة.
