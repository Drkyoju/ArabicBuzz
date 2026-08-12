# واتساب — جسر مجاني اختياري (Evolution / Baileys)

تيليجرام `@alhuda14bot` يبقى **الأساس**. واتساب للمنتج عبر جسر مجاني فقط — **لا** Meta Cloud مدفوع افتراضياً، و**لا** دمج هيرميس داخل موقع ArabicBuzz.

## خطوات الربط (١–٢–٣)

### ١) شغّل Evolution على جهازك أو VPS

```bash
cd deploy/whatsapp-bridge
cp .env.example .env
# عدّل AUTHENTICATION_API_KEY (سر قوي) و WEBHOOK_GLOBAL_URL إن لزم
docker compose up -d
```

- افتح الواجهة على المنفذ `8080` → أنشئ instance باسم `arabicbuzz`
- امسح QR من واتساب → الأجهزة المرتبطة
- التفاصيل: [deploy/whatsapp-bridge/README.md](../deploy/whatsapp-bridge/README.md)

### ٢) اضبط CranL

```bash
npm run cranl:put-env -- --restart \
  WHATSAPP_BRIDGE_URL=https://YOUR_EVOLUTION_HOST \
  WHATSAPP_BRIDGE_SECRET=نفس_AUTHENTICATION_API_KEY \
  WHATSAPP_BRIDGE_INSTANCE=arabicbuzz \
  WHATSAPP_OWNER_TO=9665xxxxxxxx \
  WHATSAPP_DEFAULT_SCOPE_ID=shared-demo
```

تحقق:  
https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp?bridge=1

### ٣) اختبر بهدوء

- أرسل رسالة خاصة لرقم الجسر
- لا تفعّل مجموعات مفتوحة ولا تردّ على كل رسالة — استخدم نطاقاً افتراضياً أو `channel_bindings`
- الربط بغرفة العمل: نفس `scopeId` مثل تيليجرام عبر `WHATSAPP_DEFAULT_SCOPE_ID` أو ربط رقم↔نطاق في القاعدة

## ما لا نفعله

- لا نوجّه جلسة هيرميس / Baileys على الماك إلى ويب هوك الموقع إلا كمسار اختياري واعٍ منفصل
- لا نضع توكن تيليجرام الجمعية في `~/.hermes`
- لا نشتري Twilio ولا نخزّن أسراراً في git

## حدود صادقة

| | |
|---|---|
| بروتوكول غير رسمي | Evolution/Baileys = واتساب ويب → **خطر حظر** للحساب |
| بيانات حساسة | لا تستخدم رقم أعمال مهم أو فواتير عملاء على جسر غير رسمي |
| هيرميس | وقف واتساب على الماك منفصل عن منتج الجمعية — انظر [hermes-mac-always-on.md](./hermes-mac-always-on.md) |
| Meta Cloud | رسمي وقد يُفوتر — لا نفعّله إلا بموافقة صريحة |

الكود: `lib/whatsapp/bridge.ts` · `app/api/webhooks/whatsapp` · إرسال عبر `sendViaWhatsAppBridge`.
