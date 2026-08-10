# مزامنة مهارات هيرميس السحابية — لما يفتح Nous

> هيرميس على هذا الماك = **واتساب فقط**. لا تفعّل تيليجرام على هيرميس.  
> لا تضع أسراراً في git. لا تنسخ جلسة Baileys إلا بهجرة مقصودة.

## ليش مقفول؟ (الجواب المختصر)

**القفل من نووس، مو منّا.** ما نقدر نفرض فتحه.

| البند | الواقع |
|--------|--------|
| رسالة CLI | `sync unavailable: not enabled for your account yet` |
| مفتاح محلي | `sync.enabled: true` → `feature_enabled: true` ✅ |
| بوابة نووس | `nous_admin: false` ← يقرأ JWT claim اسمه `tool_gateway_admin` |
| معنى الـ claim | = `Permissions.ADMIN_ACCESS` في بوابة نووس (صلاحية `/admin/*`) |
| باقة مدفوعة؟ | **لا تفتح Skill Sync.** Portal يعرض credits + Hosted tool usage فقط |
| إعداد في الواجهة؟ | **لا يوجد** زر Skill Sync في manage-subscription |
| مصدر الحقيقة | كود Hermes: `tools/skills_sync_client.py` — gate موصوف كـ *pre-launch containment* |

طالما `tool_gateway_admin=false` فـ `hermes sync now/push/pull` ترفض فوراً. فتح الميزة للعامة يحتاج نووس يستبدل بوابة الأدمن بـ entitlement حقيقي (`sync:*` / feature flag) — مو شيء نقدر نفعله من الحساب.

## الحالة (آخر فحص)

| البند | القيمة |
|--------|--------|
| تسجيل نووس | `logged_in: true` |
| جهاز | `Mac-WA-gateway` |
| مهارات معلّمة | `ar-help`, `wa-archive`, `wa-file-read`, `wa-pdf-dup`, `wa-storage-mesh`, `wa-tools`, `waqf-drive` |
| SOUL.md | **ليس** في Skill Sync الرسمي — فقط الحزمة المحمولة |
| CLI | Hermes v0.20.0 — محدّث |
| آخر فحص | ٢٠٢٦-٠٨-١٠ — `nous_admin=false` → `hermes-skills-portable-20260810-173629.tgz` (v2) |

## أمر واحد (جرّب السحابة → وإلا حدّث البديل المحمول)

```bash
cd ~/Desktop/ArabicBuzz   # أو مسار المستودع
npm run hermes:skills:sync-cloud
```

- إذا فتح نووس البوابة: يسحب ثم يدفع المهارات المعلّمة.
- إذا ما زالت مقفلة: يحدّث حزمة سرية-خالية تحت  
  `~/.hermes/backups/skills-portable/hermes-skills-portable-….tgz`

## تحضير محلي (مُنجَز على ماك البوابة)

1. `~/.hermes/config.yaml` → `sync.enabled: true` و`default_opt_in: false`
2. `hermes sync device --name Mac-WA-gateway`
3. `hermes sync enable` لكل مهارة تحت `~/.hermes/skills/local/`
4. الحساب مسجّل في نووس (`hermes portal login` إن لزم)
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

## بديل محمّل الآن (جهاز ثانٍ بدون سحابة)

الحزمة v2 تشمل: مهارات محلية + `SOUL.md` + قائمة MCP (بدون أسرار) + لقطة hub + `RESTORE.sh`.

```bash
npm run hermes:skills:status
npm run hermes:skills:pack
# انسخ الـ .tgz بقناة خاصة — لا ترفعه للمستودع
```

استعادة PC2:

```bash
# أمر واحد من الأرشيف:
bash -c 'tar -xzf hermes-skills-portable-….tgz && bash hermes-skills-portable/RESTORE.sh hermes-skills-portable-….tgz'

# الأفضل مع clone ArabicBuzz (يدمج MCP الناقص في config.yaml + bin wrappers):
hermes portal login
cd /path/to/ArabicBuzz
npm run hermes:skills:restore -- /path/to/hermes-skills-portable-….tgz
./scripts/hermes-drive-setup.sh --from-arabicbuzz && ./scripts/hermes-drive-setup.sh --probe
```

## ما لا يُزامَن سحابياً (عن عمد)

- `~/.hermes/.env` / `auth.json` / توكنات Google
- جلسة واتساب Baileys
- `SOUL.md` (حتى يضيفه نووس رسمياً — حالياً الحزمة المحمولة فقط)
- تيليجرام ArabicBuzz (منفصل تماماً)

## ماذا تقدر تسوي أنت؟

1. **الآن:** انقل الأدوات بجهاز ثانٍ عبر الحزمة المحمولة أعلاه.
2. **راقب نووس:** Discord / GitHub / changelog — لما يعلنوا Skill Sync GA أو beta حقيقي.
3. **لا تدفع باقة لأجل Skill Sync** — الاشتراك لا يقلب `tool_gateway_admin`.
4. بعد إعلان الفتح: `npm run hermes:skills:sync-cloud` مرة واحدة.

## مراجع

- سكربت: `scripts/hermes-skills-sync.sh` (`status` · `cloud` · `pack` · `restore`)
- npm: `hermes:skills:sync-cloud` · `hermes:skills:pack` · `hermes:skills:status` · `hermes:skills:restore`
- دائماً شغّال: [hermes-mac-always-on.md](./hermes-mac-always-on.md)
