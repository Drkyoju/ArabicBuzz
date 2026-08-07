# إعداد Google OAuth لـ Arabic Buzz (قائمة عربية)

الشاشات المخيفة من Google («هذا التطبيق غير موثّق» / Advanced / continue anyway) **ليست خللاً في ثقة المستخدم بالتطبيق** — بل تحذير من Google لأن تطبيق OAuth ما زال في وضع الاختبار أو يطلب صلاحيات حساسة دون إكمال التحقق.

## ماذا أصلحنا في الكود؟

| قبل | بعد |
|-----|-----|
| تسجيل الدخول يطلب تقويم + Gmail + Drive فوراً + `prompt=consent` | تسجيل الدخول يطلب فقط `openid email profile` |
| شاشة تحذير Google عند كل دخول | الدخول العادي أبسط؛ التحذير يظهر فقط عند «ربط التقويم / Gmail / Drive» لاحقاً |
| رمز البريد مخفي خلف زر | رمز البريد (OTP) ظاهر كبديل واضح بدون Google |

روابط التطبيق (المسار الحي = CranL):
- الموقع: `https://arabicbuzz-fooc9h.cranl.net/`
- سياسة الخصوصية: `https://arabicbuzz-fooc9h.cranl.net/privacy`
- ردّ التوجيه بعد الدخول: `https://arabicbuzz-fooc9h.cranl.net/auth/callback`
- Callback عند Google/Supabase: `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`
- احتياطي Netlify (اختياري): `https://arabicbuzz.netlify.app/…` — أبقِه في القوائم فقط إن بقي الموقع القديم

---

## قائمة تحقق — Google Cloud Console (مطلوب من المالك)

الحساب: `ryodan71@gmail.com`

> لا يمكن للكود أو لـ CranL CLI إضافة هذه الروابط نيابةً عنك — تحتاج ضغطات في لوحة Google.

### 1) شاشة موافقة OAuth (OAuth consent screen)

1. افتح [Google Cloud Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. اختر المشروع المرتبط بـ Arabic Buzz
3. اضبط:
   - **App name:** `Arabic Buzz`
   - **User support email:** `ryodan71@gmail.com`
   - **Application home page:** `https://arabicbuzz-fooc9h.cranl.net/`
   - **Privacy policy:** `https://arabicbuzz-fooc9h.cranl.net/privacy`
   - **Authorized domains:** أضف `cranl.net` و `supabase.co` (وأبقِ `arabicbuzz.netlify.app` إن بقي الاحتياطي)
   - **Developer contact:** `ryodan71@gmail.com`
4. ارفع شعاراً إن أمكن (من `public/icon-512.png`)

### 2) نشر التطبيق (Testing → Production)

1. في نفس صفحة Consent Screen انظر **Publishing status**
2. إذا كان **Testing**:
   - فقط المستخدمون في «Test users» يدخلون بدون حظر
   - أضف كل زميل كـ Test user، **أو**
   - اضغط **Publish app** → Production
3. للدخول بالهوية فقط (`email` / `profile`) عادةً **لا يلزم تحقق Google الرسمي** بعد النشر
4. لصلاحيات التقويم / Gmail / Drive (حساسة) ستظهر تحذيرات حتى تُكمِل **Verification** — هذا طبيعي

### 3) مستخدمو الاختبار (إن بقيت في Testing)

1. OAuth consent screen → **Test users** → Add users
2. أضف بريد كل زميل يحتاج دخول Google قبل النشر

### 4) معرّف OAuth (Credentials) — Origins بعد النقل لـ CranL

1. [Credentials](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client ID (Web)
2. **Authorized JavaScript origins** — أضف (ولا تحذف Netlify قبل التأكد):
   - `https://arabicbuzz-fooc9h.cranl.net`
   - `https://vqhbgujxhyodxcneexss.supabase.co`
   - (اختياري احتياطي) `https://arabicbuzz.netlify.app`
3. **Authorized redirect URIs** (مهم جداً — تطابق حرفي):
   - `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`
4. انسخ Client ID + Secret إلى:
   - Supabase → Authentication → Providers → Google
   - CranL Application → Environment: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (لتجديد رموز التقويم)

### 5) تفعيل واجهات Google (للربط لاحقاً وليس للدخول)

فعّل في APIs: Calendar، Gmail، Sheets، Drive.

### 6) التحقق الرسمي (اختياري — فقط إن أردت إزالة تحذير ربط التقويم)

1. Consent screen → Prepare for verification
2. اشرح لماذا تحتاج Gmail/Calendar/Drive
3. أرفق فيديو توضيحي قصير لسير الموافقة داخل Arabic Buzz
4. انتظر مراجعة Google (قد تستغرق أياماً/أسابيع)

---

## قائمة تحقق — Supabase (ضغطات لوحة — لا CLI للمضيف السحابي)

1. [Supabase Dashboard](https://supabase.com/dashboard) → مشروع Arabic Buzz → **Authentication** → **URL Configuration**
2. اضبط:
   - **Site URL:** `https://arabicbuzz-fooc9h.cranl.net`
   - **Redirect URLs** (سطر لكل قيمة):
     - `https://arabicbuzz-fooc9h.cranl.net/auth/callback`
     - (اختياري احتياطي) `https://arabicbuzz.netlify.app/auth/callback`
3. **Save**
4. Providers → Google: مفعّل + نفس Client ID/Secret
5. Providers → Email: مفعّل (لرمز OTP) — تأكد من إعدادات البريد / SMTP إن تجاوزت حد البريد الافتراضي
6. Providers → GitHub: اختياري (الزر موجود في الواجهة)

ملاحظة: ملف `supabase/config.toml` في المستودع محدّث لـ CranL كمرجع محلي فقط — **لا يغيّر** إعدادات مشروع Supabase السحابي تلقائياً.

---

## طرق الدخول بعد هذا التغيير

| الطريقة | الحالة |
|---------|--------|
| Google (هوية فقط) | أساسية — بدون صلاحيات تقويم عند الدخول |
| رمز البريد (OTP / magic link) | بديل واضح في صفحة الدخول |
| GitHub | اختياري إن كان مفعّلاً في Supabase |
| ربط تقويم / Gmail / Drive | من داخل المساحة بعد الدخول (قد تظهر شاشة تحقق Google حتى يُوثَّق التطبيق) |

---

## لماذا تظهر الشاشة المخيفة أصلاً؟

1. التطبيق يطلب صلاحيات Google حساسة (كان يحدث عند أول دخول — أُصلح في الكود).
2. حالة النشر **Testing** أو الاسم يظهر كمعرّف مشروع بدل «Arabic Buzz».
3. لم تُضف سياسة خصوصية / صفحة رئيسية في Consent Screen.
4. المستخدم ليس في قائمة Test users (قبل النشر).

بعد ضبط القائمة أعلاه + نشر الكود، دخول Google العادي يجب أن يبدو كاختيار حساب عادي. ربط الأدوات يبقى خطوة منفصلة واعية.

---

## خطوات عربية مختصرة — بعد قطع CranL (حساب المالك فقط)

الحساب المتوقع: `ryodan71@gmail.com`

> **لا يمكن للكود أو للموقع الضغط على Publish أو حفظ Redirects نيابةً عنك.**

### قائمة تحقق سريعة (انسخها)

- [ ] Google Consent: Home + Privacy = روابط `arabicbuzz-fooc9h.cranl.net`
- [ ] Google Credentials: أضفت Origin `https://arabicbuzz-fooc9h.cranl.net`
- [ ] إن كان Publishing = Testing → **Publish app** أو أضفت Test users
- [ ] Supabase URL Configuration: Site URL + Redirect = CranL `/auth/callback`
- [ ] جرّبت الدخول من https://arabicbuzz-fooc9h.cranl.net/auth/login
- [ ] (أمان) دوّرت مفتاح CranL API إن لُصق سابقاً في محادثة

### التفصيل

1. افتح [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Home = `https://arabicbuzz-fooc9h.cranl.net/` · Privacy = `https://arabicbuzz-fooc9h.cranl.net/privacy`
3. Credentials → أضف JavaScript origin للـ CranL host
4. Supabase → Authentication → URL Configuration → احفظ Site URL + Redirect لـ CranL
5. داخل Arabic Buzz بعد الدخول: الإعدادات → عقل الشركة → **«١) ربط Google (Drive)»** — كل مستخدم مرة واحدة

بعد النشر: إن بقي تحذير «غير موثّق» عند ربط Drive فقط، فهذا طبيعي لصلاحيات حساسة حتى Verification — استخدم Advanced → Continue أو أكمل التحقق لاحقاً.
