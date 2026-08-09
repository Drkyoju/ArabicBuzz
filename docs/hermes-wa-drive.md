# هيرميس ↔ Google Drive (واتساب فقط)

هيرميس على الماك = **واتساب فقط** (`+966550514658`). لا تيليجرام. بوت الجمعية `@alhuda14bot` منفصل (ArabicBuzz / CranL).

## مجلد العمل

| | |
|---|---|
| Folder ID | `1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw` |
| الرابط | https://drive.google.com/drive/folders/1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw |
| الحساب المتوقّع لـ OAuth / الملكية | **`ryodan71@gmail.com`** |

هذا المجلد مضبوط في `~/.hermes` (`HERMES_DRIVE_FOLDER_ID` + `SOUL.md` + مهارة `waqf-drive`).  
**مجلد عقل الشركة في ArabicBuzz مختلف** (`GOOGLE_DRIVE_BRAIN_FOLDER_ID` / `1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW`) — لا تخلطهما ولا تغيّر CranL من أجل هيرميس.

## كيف يتصل هيرميس بـ Drive؟

المسار المفضّل: مهارة مدمجة **`google-workspace`** (OAuth2 → `~/.hermes/google_token.json`) عبر:

```bash
hermes-gapi drive list-waqf
# = google_api.py داخل ~/.hermes/google-venv
```

بديل رسمي من Google: MCP `https://drivemcp.googleapis.com/mcp/v1` يحتاج OAuth client مسبّق التسجيل وغالباً أعقد على Monterey — **لا نستخدمه افتراضياً**.

## إعادة استخدام OAuth ArabicBuzz؟

| الطبقة | الحالة |
|--------|--------|
| **نفس حساب Google** (`ryodan71@gmail.com`) | ✅ مفضّل — نفس المالك الذي يملك/يشارك المجلد |
| **نفس Client ID من CranL** | جُرّب محلياً كـ Desktop-shaped `google_client_secret.json` |
| **شرط إضافي** | أضف Redirect URI: `http://localhost:1` لعميل OAuth في Google Cloud، **أو** أنشئ عميل **Desktop** منفصل باسم Hermes في نفس المشروع |
| **رموز ArabicBuzz في Supabase** | ❌ لا تُنسَخ إلى هيرميس (كسر فصل البيئات / خطر) |

أسرار العميل والرمز تبقى في `~/.hermes/` فقط — **لا تُرفع للمستودع**.

## إكمال الربط (مرة واحدة — يحتاج المتصفح)

```bash
# 1) تحقق
$HOME/.hermes/google-venv/bin/python \
  $HOME/.hermes/skills/productivity/google-workspace/scripts/setup.py --check

# 2) إن NOT_AUTHENTICATED — افتح الرابط المحفوظ محلياً:
cat ~/.hermes/google_oauth_last_url.txt
# سجّل الدخول كـ ryodan71@gmail.com → وافق على Drive
# المتصفح قد يفشل على http://localhost:1 (متوقع) — انسخ الرابط كاملاً من شريط العنوان

# 3) بدّل الرمز
$HOME/.hermes/google-venv/bin/python \
  $HOME/.hermes/skills/productivity/google-workspace/scripts/setup.py \
  --auth-code 'الصق_الرابط_أو_الرمز_هنا'

# 4) تحقق + جرّب المجلد
$HOME/.hermes/google-venv/bin/python \
  $HOME/.hermes/skills/productivity/google-workspace/scripts/setup.py --check
hermes-gapi drive list-waqf 10
hermes-gapi drive get 1zlsaktPbd0SpFXQNPD7-kT1ktj4jRNOw
```

سكربت مساعد في المستودع (بدون أسرار): `./scripts/hermes-drive-setup.sh`

## مشاركة المجلد

- إن كان المالك `ryodan71@gmail.com` وأكملتَ OAuth به → يكفي.
- إن أكملتَ OAuth بحساب آخر → شارك المجلد معه (محرّر إن أردت الرفع).
- رابط «أي شخص لديه الرابط» وحده **لا يكفي** لأدوات Drive API بدون صلاحية للحساب المصادق.

## Anti-ban

Drive يُنفَّذ فقط عند طلب صريح في واتساب (منشن / رد / أمر). لا مراقبة دورية للمجلد ولا بث تلقائي. أبقِ `WHATSAPP_REQUIRE_MENTION=true`.

## حالة الربط

راجع مخرجات:

```bash
./scripts/hermes-drive-setup.sh --status
```

`AUTHENTICATED` + نجاح `list-waqf` = مربوط. غير ذلك = الإعداد جاهز والموافقة من المتصفح ناقصة.
