# واتساب مع Arabic Buzz

المسار الحي: **https://arabicbuzz-fooc9h.cranl.net/**

Webhook الوارد: `POST/GET https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp`

## مساران مدعومان (بدون Twilio)

لا يوجد مسار فوترة Twilio في المنتج. اختر واحداً:

| المسار | التكلفة تقريباً | المتغيرات |
|--|--|--|
| **جسر Evolution / Baileys (مُفضَّل مجاني)** | استضافة الجسر عندك | `WHATSAPP_BRIDGE_URL` · `WHATSAPP_BRIDGE_SECRET` · `WHATSAPP_BRIDGE_INSTANCE` (اختياري) |
| **Meta Cloud API** | قد يحاسب حسب سياسة Meta | `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` · `WHATSAPP_VERIFY_TOKEN` |

ضع القيم في **CranL → Application → Environment** فقط. لا تضع أسراراً في git ولا تخترع مفاتيح.

## المسار المجاني: Evolution / Baileys

1. شغّل عامل Evolution (أو جسر Baileys متوافق) على خادم تملكه.
2. اضبط:
   - `WHATSAPP_BRIDGE_URL` = عنوان الجسر (بدون `/` في النهاية)
   - `WHATSAPP_BRIDGE_SECRET` = سر مشترك بين الجسر والتطبيق
   - `WHATSAPP_BRIDGE_INSTANCE` = اسم النسخة (افتراضي `arabicbuzz`)
3. اجعل الجسر يرسل الأحداث الواردة إلى:

   `https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp`

   (أو نطاقك المخصص بعد الربط — انظر `docs/custom-domain-ar.md`)

Netlify/CranL لا يحفظان جلسة WhatsApp Web؛ لذلك الجسر الخارجي ضروري لهذا المسار.

## مسار Meta Cloud

1. أنشئ تطبيق WhatsApp في Meta for Developers.
2. انسخ إلى CranL:
   - `WHATSAPP_TOKEN` — رمز الوصول
   - `WHATSAPP_PHONE_NUMBER_ID` — معرّف رقم الهاتف
   - `WHATSAPP_VERIFY_TOKEN` — نفس السر الذي تضعه في إعداد Webhook عند Meta
3. Webhook URL في Meta:

   `https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp`

تحقق الاشتراك (GET) يستخدم `WHATSAPP_VERIFY_TOKEN`. لا تشارك التوكن في المحادثات.

## ملاحظات تشغيل

- عند وجود `WHATSAPP_BRIDGE_URL` يُفضَّل مسار الجسر على Meta.
- رقم المالك للاختبار/التنبيه: `WHATSAPP_OWNER_TO` أو `WHATSAPP_BRIDGE_OWNER_TO` (صيغة دولية بدون `+` إن لزم الجسر).
- راجع أيضاً قسم Messaging في `.env.example`.

## ما لا نفعله

- لا نشتري رصيداً من Twilio ولا نوثّق مسار Twilio هنا.
- لا نخزّن توكنات في المستودع.
