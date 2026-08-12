# جسر واتساب المجاني (Evolution API)

**تيليجرام يبقى الأساس.** واتساب عبر جسر مجاني اختياري — **ليس** Meta Cloud مدفوعاً، و**ليس** دمج هيرميس داخل موقع ArabicBuzz.

هيرميس على الماك (جلسة Baileys منفصلة) يبقى مساراً اختيارياً خارج المنتج — انظر `docs/hermes-mac-always-on.md`.

## ١) شغّل Evolution (مرة واحدة)

```bash
cd deploy/whatsapp-bridge
cp .env.example .env
# عدّل AUTHENTICATION_API_KEY و WEBHOOK إلى رابط CranL
docker compose up -d
```

افتح واجهة Evolution (عادة المنفذ `8080`) → أنشئ instance باسم `arabicbuzz` → امسح رمز QR من واتساب → الأجهزة المرتبطة.

Webhook الوارد:

`https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp`

## ٢) اضبط CranL

```bash
npm run cranl:put-env -- --restart \
  WHATSAPP_BRIDGE_URL=https://YOUR_EVOLUTION_HOST \
  WHATSAPP_BRIDGE_SECRET=نفس_AUTHENTICATION_API_KEY \
  WHATSAPP_BRIDGE_INSTANCE=arabicbuzz \
  WHATSAPP_OWNER_TO=9665xxxxxxxx \
  WHATSAPP_DEFAULT_SCOPE_ID=shared-demo
```

تحقق:  
`https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp?bridge=1`

## ٣) اختبر بدون إزعاج

- أرسل رسالة **خاصة** لرقم الجسر من هاتفك.
- لا تفتح مجموعات عامة بـ `open` — استخدم allowlist إن أضفت مجموعات لاحقاً.
- الربط بالغرفة: نفس `scopeId` عبر `WHATSAPP_DEFAULT_SCOPE_ID` أو جدول `channel_bindings` (قناة `whatsapp` + رقم).

## حدود صادقة (مهم)

- Evolution/Baileys = واتساب ويب **غير رسمي** → خطر حظر للحساب.
- لا تستخدم رقم أعمال مهم أو بيانات عملاء حساسة على جسر غير رسمي.
- لا تدمج جلسة هيرميس في CranL إلا بمسار واعٍ منفصل.
- Meta Cloud API مسار مدفوع/رسمي — لا نفعّله افتراضياً.
