# رقم واتساب مخصص لهيرميس (مستقبلاً — لا يلزم الآن)

> **لا تفرض شريحة جديدة اليوم.** هذا مسار **أأمن لاحقاً** لتقليل خطر الحظر على رقمك الشخصي.  
> هيرميس = **واتساب فقط**. بوت الجمعية `@alhuda14bot` منفصل على تيليجرام/CranL.

## لماذا رقم مخصص؟

جلسة Baileys = حساب واتساب عادي مرتبط كـ Linked Device. أي حظر/تقييد يصيب **ذلك الرقم**.  
رقم شخصي أساسي = دائرة انفجار أكبر (جهات الاتصال، المجموعات العائلية، العمل).

| الخيار | متى |
|--------|-----|
| الإبقاء على الرقم الحالي + وضع آمن | الآن — `REQUIRE_MENTION` + allowlist + تأخير الإرسال |
| رقم مخصص (شريحة/جهاز ثانٍ) | عندما تريد عزل الخطر عن رقمك الشخصي |
| WhatsApp Cloud API (`hermes whatsapp-cloud`) | مسار أعمال رسمي — قدرات مجموعات مختلفة؛ قيّمه لاحقاً |

## خطوات الهجرة (عندما تقرر)

1. **جهز** هاتفاً احتياطياً + شريحة (أو رقم eSIM) باسم جهة اتصال واضح مثل «هيرميس».
2. **انسخ احتياطياً** الجلسة الحالية قبل أي قطع:
   ```bash
   npm run hermes:backup:wa
   ./scripts/hermes-backup-wa-session.sh --list
   ```
3. **أوقف** البوابة: `hermes gateway stop`
4. **اربط الرقم الجديد** فقط:
   ```bash
   hermes whatsapp   # امسح QR من هاتف الرقم المخصص
   ```
5. في `~/.hermes/.env` (محلي — لا للمستودع):
   - `WHATSAPP_ALLOWED_USERS=` رقم المالك بصيغة دولية بدون `+`
   - أبقِ `WHATSAPP_REQUIRE_MENTION=true`
   - أبقِ `WHATSAPP_GROUP_POLICY=allowlist`
   - لا تضع `ALLOWED_USERS=*`
6. **انضم** للقروب (عمل الوقف) بالرقم الجديد → allowlist:
   ```bash
   node scripts/hermes-wa-join-invite.mjs 'https://chat.whatsapp.com/…'
   ./scripts/hermes-wa-allowlist-sync.sh --add '…@g.us'
   ```
7. **اختبر** @منشن في القروب — رد واحد قصير.
8. **أزل** الرقم الشخصي من القروب إن لم يعد مطلوباً.
9. **حدّث** الوثائق المحلية برقم الهاتف الجديد (لا ترفع أسراراً).

## ما يبقى كما هو (anti-ban)

- لا ترد على كل رسالة (`REQUIRE_MENTION=true`)
- تأخير المقاطع `WHATSAPP_CHUNK_DELAY_MS` ≥ 1800
- لا تيليجرام/ديسكورد على هيرميس
- لا تلمس `@alhuda14bot`

## مرجع

- [docs/hermes-mac-always-on.md](./hermes-mac-always-on.md) — الوضع الآمن الحالي
- [deploy/hermes/README.md](../deploy/hermes/README.md) — سكربتات واتساب
