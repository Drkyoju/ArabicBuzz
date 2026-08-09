# واتساب — فصل عن منتج الجمعية

## السياسة الحالية

| | |
|---|---|
| **هيرميس** | وقف واتساب فقط (جلسة Baileys على الماك، `+966550514658`) — انظر [hermes-wa-drive.md](./hermes-wa-drive.md) |
| **الجمعية (ArabicBuzz)** | تيليجرام `@alhuda14bot` + الموقع + الوكلاء — **لا** تستخدم واتساب هيرميس |

الموقع الحي (CranL) **لا** يشغّل واتساب هيرميس. مسارات `lib/whatsapp` و`/api/webhooks/whatsapp` بقايا اختيارية معطّلة افتراضياً — **لا** تضبط `WHATSAPP_BRIDGE_*` أو `WHATSAPP_TOKEN` على CranL لربط رقم هيرميس.

## ما لا نفعله

- لا نوجّه جلسة هيرميس / Baileys إلى ويب هوك الموقع.
- لا نضع `TELEGRAM_BOT_TOKEN` (@alhuda14bot) في `~/.hermes`.
- لا نشتري رصيداً من Twilio ولا نخزّن توكنات في المستودع.

للتفاصيل التشغيلية لهيرميس: [hermes-wa-drive.md](./hermes-wa-drive.md) · [hermes-mac-always-on.md](./hermes-mac-always-on.md).  
لتيليجرام الجمعية: [telegram-bot-ar.md](./telegram-bot-ar.md).
