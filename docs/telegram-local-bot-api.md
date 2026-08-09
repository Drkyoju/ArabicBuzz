# Telegram Local Bot API (ملفات أكبر من ~20 م.ب — مجاني)

بوتات تيليجرام **السحابية** (`api.telegram.org`) لا تستطيع تنزيل ملفات أكبر من **~20 م.ب**.

ArabicBuzz يجرّب تلقائياً (بلا دفع وبلا طلب إعادة إرسال):

1. **Local Bot API** عبر `TELEGRAM_BOT_API_URL` (إن وُجد — VPS 24/7 أو نفق إلى الماك)
2. **جسر الماك** `MAC_SYNC_URL` → `POST /telegram/fetch-file` (Bot API محلي على 8081 ثم **MTProto** إن عرف chat/message)
3. سحابة تيليجرام (للملفات الصغيرة / أحجام خاطئة)
4. خزنة الغرفة / Drive بنفس الاسم حرفياً ثم إكمال المهمة (`waiting_file` → تنفيذ → `sendDocument`)

`/status` يعرض أي hop متاح الآن.

## OrbStack على الماك — هل الجهاز لازم يكون شغال؟

**نعم.** OrbStack يشغّل الحاوية على الماك المحلي. نوم الماك أو إغلاقه أو توقف OrbStack = توقف hop الماك.

للتشغيل **الثابت والمستمر 24/7**: شغّل `deploy/telegram-bot-api` على أي جهاز دائماً يعمل واضبط `TELEGRAM_BOT_API_URL` على CranL — انظر [telegram-always-on-bot-api.md](./telegram-always-on-bot-api.md).

## هل CranL يشغّل telegram-bot-api؟

**لا داخل صورة التطبيق النحيفة.** مثل PaddleOCR: TDLib ثقيل ويحتاج قرصاً دائماً و`API_ID`/`API_HASH`. CranL Basic = حاوية Next فقط.

المسار المجاني: شغّل الخادم المحلي على **الماك** (أو VPS دائماً) واضبط أحد المتغيرين على CranL:

- `TELEGRAM_BOT_API_URL=https://…` (نفق إلى منفذ 8081) ← **المسار الدائم إن كان المضيف 24/7**
- `MAC_SYNC_URL=…` مع `npm run storage:sync` على الماك وLocal Bot API على `127.0.0.1:8081` ← يعمل فقط والماك مستيقظ

## تشغيل سريع على الماك (OrbStack / Docker)

```bash
# مفاتيح من https://my.telegram.org
export TELEGRAM_API_ID=…
export TELEGRAM_API_HASH=…
export TELEGRAM_BOT_TOKEN=…   # نفس توكن البوت على CranL

cd deploy/telegram-bot-api
docker compose up -d

# اختياري: عرّض 8081 عبر النفق، أو اترك جسر الماك يستدعي 127.0.0.1:8081
npm run storage:sync
```

على CranL (Environment):

```bash
# إما مباشرة (مستحسن للـ 24/7 على VPS):
TELEGRAM_BOT_API_URL=https://your-tunnel.example

# أو عبر جسر الماك (يحتاج الماك مستيقظاً):
MAC_SYNC_URL=https://your-mac-tunnel.example
MAC_SYNC_SECRET=…
```

## MTProto / userbot (أرشفة تاريخ المجموعة القديمة + احتياطي تنزيل)

بوت API **لا يستطيع** قراءة رسائل المجموعة التي لم يستلمها عبر الويب هوك — حتى Local Bot API. هذا حد تيليجرام وليس خللاً في ArabicBuzz.

المسار المجاني للمسح العميق (ملفات + صوت قديمة) وللتنزيل الاحتياطي عبر جسر الماك:

1. من https://my.telegram.org خذ `TELEGRAM_API_ID` و `TELEGRAM_API_HASH`
2. على الماك (حساب **عضو** في «عمل الجمعية»، ليس البوت):

```bash
export TELEGRAM_API_ID=…
export TELEGRAM_API_HASH=…
npm run telegram:mtproto-login   # يطبع TELEGRAM_SESSION_STRING — بلا رسالة للمجموعة
# أضف السطر إلى .env.local على الماك
npm run storage:sync             # يعرّض POST /telegram/scan-history و fetch-file→MTProto
```

3. على CranL: `MAC_SYNC_URL` + `MAC_SYNC_SECRET` (كما لملفات الكبيرة)

الكرون يستدعي `/api/telegram/archive-group` → يمسح عبر الماك صامتاً، يحقن البايتات في الغرفة/Drive، ويكمل المهام تلقائياً عند ظهور الملف — **بدون طلب إعادة إرسال**.

القوالب أيضاً لـ MCP محلي: `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `TELEGRAM_SESSION_STRING`.

## حد الرفع

`sendDocument` السحابي ≈ 50 م.ب. الناتج الأكبر يُحفظ في خزنة الغرفة مع رسالة عربية صادقة.
