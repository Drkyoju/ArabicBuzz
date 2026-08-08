# Telegram Local Bot API (ملفات أكبر من ~20 م.ب — مجاني)

بوتات تيليجرام **السحابية** (`api.telegram.org`) لا تستطيع تنزيل ملفات أكبر من **~20 م.ب**.

ArabicBuzz يجرّب تلقائياً (بلا دفع وبلا طلب إعادة إرسال):

1. **Local Bot API** عبر `TELEGRAM_BOT_API_URL` (إن وُجد)
2. **جسر الماك** `MAC_SYNC_URL` → `POST /telegram/fetch-file` (Bot API محلي على 8081)
3. سحابة تيليجرام (للملفات الصغيرة / أحجام خاطئة)
4. خزنة الغرفة / Drive بنفس الاسم حرفياً ثم إكمال المهمة (`waiting_file` → تنفيذ → `sendDocument`)

## هل CranL يشغّل telegram-bot-api؟

**لا داخل صورة التطبيق النحيفة.** مثل PaddleOCR: TDLib ثقيل ويحتاج قرصاً دائماً و`API_ID`/`API_HASH`. CranL Basic = حاوية Next واحدة.

المسار المجاني: شغّل الخادم المحلي على **الماك** (أو Fly/VPS) واضبط أحد المتغيرين على CranL:

- `TELEGRAM_BOT_API_URL=https://…` (نفق إلى منفذ 8081)، أو
- `MAC_SYNC_URL=…` مع `npm run storage:sync` على الماك وLocal Bot API على `127.0.0.1:8081`

## تشغيل سريع على الماك

```bash
# مفاتيح من https://my.telegram.org
export TELEGRAM_API_ID=…
export TELEGRAM_API_HASH=…
export TELEGRAM_BOT_TOKEN=…   # نفس توكن البوت على CranL

cd deploy/telegram-bot-api
docker compose up -d

# اختياري: عرّض 8081 عبر النفق، أو اترك جسر الماك يستدعي 127.0.0.1:8081
```

على CranL (Environment):

```bash
# إما مباشرة:
TELEGRAM_BOT_API_URL=https://your-tunnel.example

# أو عبر جسر الماك (مستحسن إن كان storage:sync يعمل أصلاً):
MAC_SYNC_URL=https://your-mac-tunnel.example
MAC_SYNC_SECRET=…
```

## MTProto / userbot (أرشفة تاريخ المجموعة القديمة)

بوت API **لا يستطيع** قراءة رسائل المجموعة التي لم يستلمها عبر الويب هوك — حتى Local Bot API. هذا حد تيليجرام وليس خللاً في ArabicBuzz.

المسار المجاني للمسح العميق (ملفات + صوت قديمة):

1. من https://my.telegram.org خذ `TELEGRAM_API_ID` و `TELEGRAM_API_HASH`
2. على الماك (حساب **عضو** في «عمل الجمعية»، ليس البوت):

```bash
export TELEGRAM_API_ID=…
export TELEGRAM_API_HASH=…
npm run telegram:mtproto-login   # يطبع TELEGRAM_SESSION_STRING — بلا رسالة للمجموعة
# أضف السطر إلى .env.local على الماك
npm run storage:sync             # يعرّض POST /telegram/scan-history
```

3. على CranL: `MAC_SYNC_URL` + `MAC_SYNC_SECRET` (كما لملفات الكبيرة)

الكرون يستدعي `/api/telegram/archive-group` → يمسح عبر الماك صامتاً، يحقن البايتات في الغرفة/Drive، ويكمل مهمة المعلم الأول (نسخ ص48 بعد ص45 + sendDocument) تلقائياً عند ظهور الملف — **بدون طلب إعادة إرسال** وبدون دليل الأحياء.

القوالب أيضاً لـ MCP محلي: `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `TELEGRAM_SESSION_STRING`.

## حد الرفع

`sendDocument` السحابي ≈ 50 م.ب. الناتج الأكبر يُحفظ في خزنة الغرفة مع رسالة عربية صادقة.
