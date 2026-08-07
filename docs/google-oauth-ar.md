# إعداد Google OAuth لـ Arabic Buzz (قائمة عربية)

الشاشات المخيفة من Google («هذا التطبيق غير موثّق» / Advanced / continue anyway) **ليست خللاً في ثقة المستخدم بالتطبيق** — بل تحذير من Google لأن تطبيق OAuth ما زال في وضع الاختبار أو يطلب صلاحيات حساسة دون إكمال التحقق.

## ماذا أصلحنا في الكود؟

| قبل | بعد |
|-----|-----|
| تسجيل الدخول يطلب تقويم + Gmail + Drive فوراً + `prompt=consent` | تسجيل الدخول يطلب فقط `openid email profile` |
| شاشة تحذير Google عند كل دخول | الدخول العادي أبسط؛ التحذير يظهر فقط عند «ربط التقويم / Gmail / Drive» لاحقاً |
| رمز البريد مخفي خلف زر | رمز البريد (OTP) ظاهر كبديل واضح بدون Google |

روابط التطبيق:
- الموقع: `https://arabicbuzz.netlify.app/`
- سياسة الخصوصية: `https://arabicbuzz.netlify.app/privacy`
- ردّ التوجيه بعد الدخول: `https://arabicbuzz.netlify.app/auth/callback`
- Callback عند Google/Supabase: `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`

---

## قائمة تحقق — Google Cloud Console (مطلوب من المالك)

الحساب: `ryodan71@gmail.com`

### 1) شاشة موافقة OAuth (OAuth consent screen)

1. افتح [Google Cloud Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. اختر المشروع المرتبط بـ Arabic Buzz
3. اضبط:
   - **App name:** `Arabic Buzz`
   - **User support email:** `ryodan71@gmail.com`
   - **Application home page:** `https://arabicbuzz.netlify.app/`
   - **Privacy policy:** `https://arabicbuzz.netlify.app/privacy`
   - **Authorized domains:** أضف `arabicbuzz.netlify.app` و `supabase.co`
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

### 4) معرّف OAuth (Credentials)

1. [Credentials](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client ID (Web)
2. **Authorized JavaScript origins:**
   - `https://arabicbuzz.netlify.app`
   - `https://vqhbgujxhyodxcneexss.supabase.co`
3. **Authorized redirect URIs** (مهم جداً — تطابق حرفي):
   - `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`
4. انسخ Client ID + Secret إلى:
   - Supabase → Authentication → Providers → Google
   - Netlify env: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (لتجديد رموز التقويم)

### 5) تفعيل واجهات Google (للربط لاحقاً وليس للدخول)

فعّل في APIs: Calendar، Gmail، Sheets، Drive.

### 6) التحقق الرسمي (اختياري — فقط إن أردت إزالة تحذير ربط التقويم)

1. Consent screen → Prepare for verification
2. اشرح لماذا تحتاج Gmail/Calendar/Drive
3. أرفق فيديو توضيحي قصير لسير الموافقة داخل Arabic Buzz
4. انتظر مراجعة Google (قد تستغرق أياماً/أسابيع)

---

## قائمة تحقق — Supabase

1. Authentication → URL Configuration
   - **Site URL:** `https://arabicbuzz.netlify.app`
   - **Redirect URLs:** `https://arabicbuzz.netlify.app/auth/callback`
2. Providers → Google: مفعّل + نفس Client ID/Secret
3. Providers → Email: مفعّل (لرمز OTP) — تأكد من إعدادات البريد / SMTP إن تجاوزت حد البريد الافتراضي
4. Providers → GitHub: اختياري (الزر موجود في الواجهة)

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
