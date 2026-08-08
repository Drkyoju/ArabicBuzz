# نطاق مخصص لـ Arabic Buzz (دليل صادق)

الموقع الحي حالياً: **https://arabicbuzz-fooc9h.cranl.net/**

> **الكود لا يشتري نطاقاً ولا يضبط DNS نيابةً عنك.** شراء النطاق (Namecheap / Cloudflare / GoDaddy / …) وضبط السجلات يتم من لوحة المسجّل ولوحة CranL يدوياً.

## ماذا تحتاج؟

1. نطاق تملكه (مثال: `arabicbuzz.sa` أو `app.your-org.sa`)
2. وصول إلى DNS عند المسجّل
3. وصول إلى مشروع CranL + Google Cloud + Supabase + بوت تيليجرام

## خطوات عامة (CranL)

1. في لوحة CranL: Applications → تطبيق Arabic Buzz → ابحث عن **Custom domain** / **Domains** (إن وُجد في خطتك).
2. أضف اسم النطاق (مثل `app.example.com`).
3. CranL يعرض عادةً هدفاً لـ **CNAME** (أو تعليمات A). انسخ القيمة كما تظهر في اللوحة — لا تخمّن.

### ملاحظات DNS عامة (ليست خاصة بمسجّل واحد)

| النوع | متى | ملاحظة |
|--|--|--|
| **CNAME** | نطاق فرعي (`app.` / `www.`) | الأكثر شيوعاً للتطبيقات — يشير إلى مضيف CranL الذي تعطيه اللوحة |
| **A** | أحياناً للجذر (`example.com`) | فقط إن طلبت CranL عنوان IP صريحاً |
| **HTTPS** | بعد انتشار DNS | الشهادة غالباً تلقائية بعد نجاح التحقق — انتظر دقائق إلى ساعات |

انتظر انتشار DNS (قد يستغرق من دقائق إلى 48 ساعة) قبل اختبار الدخول.

## بعد ربط النطاق — حدّث البيئة والتكاملات

استبدل كل ظهور لـ `https://arabicbuzz-fooc9h.cranl.net` بعنوانك الجديد (بدون شرطة مائلة زائدة إلا حيث يلزم المسار).

### 1) CranL Environment

- `NEXT_PUBLIC_APP_URL=https://your-domain.example`
- `APP_URL` إن وُجد — نفس القيمة العامة

ثم أعد النشر.

### 2) Google OAuth

في [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

- **Authorized JavaScript origins:** أضف `https://your-domain.example`
- **Authorized domains** في شاشة الموافقة: أضف النطاق الجذري

التفاصيل: `docs/google-oauth-ar.md`

### 3) تيليجرام Webhook

بعد ضبط `NEXT_PUBLIC_APP_URL` للنطاق الجديد:

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.example npx tsx scripts/set-telegram-webhook.ts
```

المسار المتوقع: `https://your-domain.example/api/webhooks/telegram`

### 4) Supabase Redirect URLs

Authentication → URL Configuration:

- **Site URL:** `https://your-domain.example`
- **Redirect URLs:** أضف `https://your-domain.example/auth/callback` (وأبقِ CranL القديم مؤقتاً إن رغبت)

### 5) واتساب (إن مفعّل)

حدّث Webhook في Meta / الجسر ليشير إلى:

`https://your-domain.example/api/webhooks/whatsapp`

راجع `docs/whatsapp-ar.md`.

## أثناء الانتقال

- أبقِ `https://arabicbuzz-fooc9h.cranl.net` في قوائم OAuth/Redirect حتى تتأكد أن النطاق الجديد يعمل.
- لا تحذف Origin القديم قبل نجاح تسجيل الدخول على النطاق الجديد.
- Netlify (`arabicbuzz.netlify.app`) احتياطي فقط — ليس هدف QA الأساسي.

## ما لن يفعله هذا المستودع

- لن يدفع ثمن النطاق
- لن يكتب سجلات DNS عند المسجّل
- لن يخترع مفاتيح أو أسرار — ضع القيم في CranL Environment فقط
