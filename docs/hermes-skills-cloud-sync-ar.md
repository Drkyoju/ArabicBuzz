# مزامنة مهارات هيرميس السحابية — لما يفتح Nous

> هيرميس على هذا الماك = **واتساب فقط**. لا تفعّل تيليجرام على هيرميس.  
> لا تضع أسراراً في git. لا تنسخ جلسة Baileys إلا بهجرة مقصودة.

## الحالة (آخر فحص)

| البند | القيمة المتوقعة |
|--------|------------------|
| تسجيل نووس | `logged_in: true` |
| مفتاح محلي | `sync.enabled: true` → `feature_enabled: true` |
| بوابة نووس | `nous_admin: false` حتى يفتحوا Skill Sync للحساب |
| جهاز | تسمية `Mac-WA-gateway` |
| مهارات معلّمة | `ar-help`, `wa-archive`, `wa-file-read`, `wa-pdf-dup`, `wa-storage-mesh`, `wa-tools`, `waqf-drive` |
| SOUL.md | **ليس** في Skill Sync الرسمي — فقط الحزمة المحمولة |
| آخر فحص محلي | ٢٠٢٦-٠٨-١٠ عبر `npm run hermes:skills:sync-cloud` — `nous_admin=false` → حزمة محمولة `hermes-skills-portable-20260810-160920.tgz` |

طالما `nous_admin=false` فـ `hermes sync now` يرد:  
`sync unavailable: not enabled for your account yet.`

## أمر واحد (جرّب السحابة → وإلا حدّث البديل المحمول)

```bash
cd ~/Desktop/ArabicBuzz   # أو مسار المستودع
npm run hermes:skills:sync-cloud
```

- إذا فتح نووس البوابة: يسحب ثم يدفع المهارات المعلّمة.
- إذا ما زالت مقفلة: يحدّث حزمة سرية-خالية تحت  
  `~/.hermes/backups/skills-portable/hermes-skills-portable-….tgz`

لا حاجة لـ launchd/كرون مزعج — أعد الأمر يدوياً بعد إعلان نووس أو بعد تعديل المهارات المحلية.

## تحضير محلي (مُنجَز على ماك البوابة)

1. `~/.hermes/config.yaml` → `sync.enabled: true` و`default_opt_in: false`
2. `hermes sync device --name Mac-WA-gateway`
3. `hermes sync enable` لكل مهارة تحت `~/.hermes/skills/local/`
4. الحساب مسجّل في نووس (`hermes portal login` إن لزم — نفس `ryodan71@…`)
5. واتساب متصل؛ تيليجرام معطّل على هيرميس

## لما يفتح نووس — ماذا تفعل؟

```bash
npm run hermes:skills:sync-cloud
# أو:
hermes sync status    # تأكد: nous_admin=true
hermes sync now       # pull ثم push
```

على جهاز ثانٍ بعد فتح السحابة:

```bash
hermes portal login          # نفس الحساب
hermes sync now              # يسحب المهارات المعلّمة
# SOUL + قائمة MCP بدون أسرار ما زالت عبر الحزمة المحمولة إن احتجتها:
npm run hermes:skills:restore -- /path/to/hermes-skills-portable-….tgz
```

## بديل محمّل (قبل فتح نووس / لنقل SOUL)

```bash
npm run hermes:skills:status
npm run hermes:skills:pack
# انسخ الـ .tgz بقناة خاصة — لا ترفعه للمستودع
```

استعادة على PC2: انظر قسم Multi-device في [hermes-mac-always-on.md](./hermes-mac-always-on.md).

## ما لا يُزامَن سحابياً (عن عمد)

- `~/.hermes/.env` / `auth.json` / توكنات Google
- جلسة واتساب Baileys
- `SOUL.md` (حتى يضيفه نووس رسمياً — حالياً الحزمة المحمولة فقط)
- تيليجرام ArabicBuzz (منفصل تماماً)

## مراجع

- سكربت: `scripts/hermes-skills-sync.sh` (`status` · `cloud` · `pack` · `restore`)
- npm: `hermes:skills:sync-cloud` · `hermes:skills:pack` · `hermes:skills:status`
- دائماً شغّال: [hermes-mac-always-on.md](./hermes-mac-always-on.md)
