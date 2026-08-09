# رقم واتساب مخصص لهيرميس (اختياري — لا يلزم الآن)

> **لا تفرض شريحة جديدة اليوم.** الرقم الحالي `+966550514658` يبقى يعمل.  
> هذا مسار **أأمن لاحقاً** لتقليل خطر الحظر على رقمك الشخصي.  
> هيرميس = **واتساب فقط** (Baileys). بوت الجمعية `@alhuda14bot` منفصل على تيليجرام/CranL.  
> **لا Meta WhatsApp Cloud** في هذا المسار.

## لماذا رقم مخصص؟

جلسة Baileys = حساب واتساب عادي مرتبط كـ Linked Device. أي حظر/تقييد يصيب **ذلك الرقم**.  
رقم شخصي أساسي = دائرة انفجار أكبر (جهات الاتصال، المجموعات العائلية، العمل).

| الخيار | متى |
|--------|-----|
| الإبقاء على الرقم الحالي + وضع آمن | **الآن** — `REQUIRE_MENTION` + allowlist + تأخير الإرسال |
| رقم مخصص (شريحة/جهاز ثانٍ) + عزل الجلسة | عندما تريد عزل الخطر عن رقمك الشخصي |
| WhatsApp Cloud API (Meta) | **مستبعد هنا** — لا ننفّذه في هذا المشروع حالياً |

## تحضير آمن (أتمتة خفيفة)

```bash
# قائمة تحقق فقط — لا يغيّر شيئاً
npm run hermes:wa:prepare-dedicated

# نسخ احتياطي للجلسة الحالية (موصى به دائماً قبل أي هجرة)
npm run hermes:wa:prepare-dedicated -- --backup
# = npm run hermes:backup:wa

# عزل الجلسة الحالية جانباً ثم ربط رقم جديد (فقط عندما تكون جاهزاً)
npm run hermes:wa:prepare-dedicated -- --isolate
hermes whatsapp   # امسح QR من هاتف الرقم المخصص فقط
```

السكربت: [`scripts/hermes-wa-prepare-dedicated.sh`](../scripts/hermes-wa-prepare-dedicated.sh)  
النسخ الاحتياطي/الاستعادة: [`scripts/hermes-backup-wa-session.sh`](../scripts/hermes-backup-wa-session.sh)

## خطوات الهجرة (عندما تقرر)

1. **جهّز** هاتفاً احتياطياً + شريحة (أو eSIM) باسم جهة اتصال واضح مثل «هيرميس».
2. **انسخ احتياطياً** الجلسة الحالية:
   ```bash
   npm run hermes:backup:wa
   ./scripts/hermes-backup-wa-session.sh --list
   ```
3. **اعزل** الجلسة القديمة (يوقف البوابة وينقل المجلد جانباً):
   ```bash
   npm run hermes:wa:prepare-dedicated -- --isolate
   ```
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
8. **أزل** الرقم الشخصي من القروب إن لم يعد مطلوباً (اختياري).
9. **حدّث** ملاحظاتك المحلية برقم الهاتف الجديد (لا ترفع أسراراً).

### التراجع

```bash
# من الأرشيف
./scripts/hermes-backup-wa-session.sh --restore ~/Backups/hermes-wa/hermes-wa-….tgz

# أو إعادة مجلد session-aside-* يدوياً إلى platforms/whatsapp/session ثم:
hermes gateway restart
```

## ما يبقى كما هو (anti-ban)

- لا ترد على كل رسالة (`REQUIRE_MENTION=true`)
- تأخير المقاطع `WHATSAPP_CHUNK_DELAY_MS` ≥ 1800
- لا تيليجرام/ديسكورد على هيرميس
- لا تلمس `@alhuda14bot`
- لا تنشر جلسة Baileys في git / iCloud العام

## عزل الجلسات (مفهوم)

| المجلد | المعنى |
|--------|--------|
| `~/.hermes/platforms/whatsapp/session` | الجلسة النشطة (رقم واحد في كل مرة) |
| `session-aside-YYYYMMDD-…` | جلسة الرقم السابق بعد `--isolate` |
| `~/Backups/hermes-wa/*.tgz` | أرشيف مشفّر محلياً (mode 600) — ليس للمستودع |

لا تشغّل جلستين Baileys لنفس الحساب على جهازين في آنٍ واحد دون فهم خطر التعارض.

## مرجع

- [docs/hermes-mac-always-on.md](./hermes-mac-always-on.md) — الوضع الآمن الحالي  
- [deploy/hermes/README.md](../deploy/hermes/README.md) — سكربتات واتساب  
- [docs/daily-habit-ar.md](./daily-habit-ar.md) — عادة خفيفة بلا سبام  
