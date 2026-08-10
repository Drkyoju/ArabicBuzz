# Fly.io — Telegram Bot API (prepare only)

> **لا تنشر الآن.** المستخدم أجّل النشر المدفوع على Fly.  
> هذا المستند + السكربتات **تحضير فقط** — لا تشغّل `fly deploy` / `npm run telegram:bot-api:fly` إلا بطلب صريح.

الموقع الحي يبقى على CranL: https://arabicbuzz-fooc9h.cranl.net/  
بوت الجمعية: `@alhuda14bot` فقط (لا WhatsApp داخل الموقع، لا Hermes تيليجرام).

## لماذا Fly؟

جسر الماك (`MAC_SYNC_URL` + OrbStack Local Bot API) يعمل **طالما الماك مستيقظ**. للنوم / السفر / 24/7 حقيقي لملفات تيليجرام الكبيرة (`getFile` > ~20MB) تحتاج Local Bot API على مضيف دائماً يعمل.

| اليوم (مجاني / ماك) | لاحقاً (Fly — مدفوع تقريباً) |
|---------------------|------------------------------|
| `npm run mac-hop:install` ثم `npm run mac-hop:health` | حاوية `deploy/telegram-bot-api` على Fly |
| `npm run mac-nosleep:install` + OrbStack **1.5.1 فقط** | `TELEGRAM_BOT_API_URL=https://…fly.dev` ثابت |
| نفق trycloudflare يتغيّر | قرص دائم (volume) لملفات Bot API الكبيرة — معلّق في `fly.toml` حتى النشر |
| الماك نائم = hop متوقف | الملفات الكبيرة تُحمَّل بدون الماك |

## تحضير بدون نشر

```bash
# 1) تحقق من المتطلبات محلياً (لا ينشر)
npm run fly:bot-api:prepare
# = ./scripts/fly-bot-api-prepare.sh

# 2) أبقِ الماك مستيقظاً للملفات الكبيرة الآن
npm run mac-nosleep:install
npm run orbstack:pin
npm run mac-hop:install

# 3) اقرأ «متى تقلب» أدناه — لا تنشر حتى تتوفر البطاقة + القرار
```

### قائمة تحقق قبل أي نشر مستقبلي

1. `fly auth login` أو `FLY_API_TOKEN` (لا تُرفع للمستودع)
2. `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` من https://my.telegram.org
3. نفس `TELEGRAM_BOT_TOKEN` لـ `@alhuda14bot` (موجود على CranL)
4. قرص دائم اختياري لتخزين ملفات Bot API (volume) — راجع `deploy/telegram-bot-api/fly.toml`
5. بعد النشر: ضع `TELEGRAM_BOT_API_URL` على CranL عبر `npm run cranl:put-env`
6. أبقِ `MAC_SYNC_URL` اختيارياً لـ OCR / MTProto / خزنة الماك

## متى تقلب إلى Fly؟ (flip criteria)

اقلب **فقط** عندما يتحقق واحد على الأقل:

| إشارة | معنى |
|--------|------|
| بطاقة Fly + موافقة صريحة على الإنفاق | شرط مالي — بدونه يبقى التحضير فقط |
| الماك ينام/يسافر وملفات >20MB تفشل مراراً | hop الماك لم يعد يكفي للتشغيل |
| تحتاج `TELEGRAM_BOT_API_URL` ثابتاً بلا نفق trycloudflare | استقرار تشغيل |

**لا تقلب** من أجل Hermes WhatsApp — Baileys يبقى على الماك. Fly هنا لـ **تيليجرام Bot API فقط**.

### خطوات القلب (بعد الموافقة الصريحة)

```bash
npm run fly:bot-api:prepare          # تأكيد الجاهزية
fly auth login                       # إن لم تكن مسجّلاً
npm run telegram:bot-api:fly         # نشر — بطلب صريح فقط
# ثم على CranL:
npm run cranl:put-env TELEGRAM_BOT_API_URL=https://<app>.fly.dev
```

تحقق: `/status` في تيليجرام يظهر hop Local Bot API حياً حتى لو الماك نائماً.

## ما لا يفعله هذا المسار

- **لا** ينشر Hermes WhatsApp على Fly (Baileys + جلسة QR — مسار منفصل ومؤجّل)
- **لا** يستبدل `@alhuda14bot`
- **لا** يشغّل واتساب داخل ArabicBuzz
- **لا** يستخدم Meta WhatsApp Cloud

## أوامر النشر (محظورة حتى يُطلب صراحةً)

```bash
# لا تشغّل الآن:
# npm run telegram:bot-api:fly
# ./deploy/telegram-bot-api/deploy-fly.sh
```

Failover الحالي: `npm run mac-hop:install` · `npm run mac-hop:health` · `docs/telegram-always-on-bot-api.md`.
