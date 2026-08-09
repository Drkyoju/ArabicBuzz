# Fly.io — Telegram Bot API (prepare only)

> **لا تنشر الآن.** المستخدم أجّل النشر المدفوع على Fly.  
> هذا المستند + السكربتات **تحضير فقط** — لا تشغّل `fly deploy` / `npm run telegram:bot-api:fly` إلا بطلب صريح.

الموقع الحي يبقى على CranL: https://arabicbuzz-fooc9h.cranl.net/  
بوت الجمعية: `@alhuda14bot` فقط (لا WhatsApp داخل الموقع، لا Hermes تيليجرام).

## لماذا Fly؟

جسر الماك (`MAC_SYNC_URL` + OrbStack Local Bot API) يعمل **طالما الماك مستيقظ**. للنوم / السفر / 24/7 حقيقي لملفات تيليجرام الكبيرة (`getFile` > ~20MB) تحتاج Local Bot API على مضيف دائماً يعمل.

| اليوم (مجاني / ماك) | لاحقاً (Fly — مدفوع تقريباً) |
|---------------------|------------------------------|
| `npm run mac-hop:install` | حاوية `deploy/telegram-bot-api` على Fly |
| نفق trycloudflare يتغيّر | `TELEGRAM_BOT_API_URL=https://…fly.dev` ثابت |
| الماك نائم = hop متوقف | الملفات الكبيرة تُحمَّل بدون الماك |

## تحضير بدون نشر

```bash
# 1) تحقق من المتطلبات محلياً (لا ينشر)
./scripts/fly-bot-api-prepare.sh

# 2) اقرأ قائمة التحقق أدناه واملأ الأسرار عند القرار بالنشر فقط
```

### قائمة تحقق قبل أي نشر مستقبلي

1. `fly auth login` أو `FLY_API_TOKEN` (لا تُرفع للمستودع)
2. `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` من https://my.telegram.org
3. نفس `TELEGRAM_BOT_TOKEN` لـ `@alhuda14bot` (موجود على CranL)
4. قرص دائم اختياري لتخزين ملفات Bot API (volume) — راجع `deploy/telegram-bot-api/fly.toml`
5. بعد النشر: ضع `TELEGRAM_BOT_API_URL` على CranL عبر `npm run cranl:put-env`
6. أبقِ `MAC_SYNC_URL` اختيارياً لـ OCR / MTProto / خزنة الماك

## ما لا يفعله هذا المسار

- **لا** ينشر Hermes WhatsApp على Fly (Baileys + جلسة QR — مسار منفصل ومؤجّل)
- **لا** يستبدل `@alhuda14bot`
- **لا** يشغّل واتساب داخل ArabicBuzz

## أوامر النشر (محظورة حتى يُطلب صراحةً)

```bash
# لا تشغّل الآن:
# npm run telegram:bot-api:fly
# ./deploy/telegram-bot-api/deploy-fly.sh
```

Failover الحالي: `npm run mac-hop:watchdog:force` + `docs/telegram-always-on-bot-api.md`.
