# مسار دائم لملفات تيليجرام الكبيرة (24/7)

## الحقيقة عن OrbStack على الماك

**نعم — الجهاز يجب أن يكون مستيقظاً.**

OrbStack (أو Docker Desktop) يشغّل `telegram-bot-api` **على الماك المحلي**. إذا نام الماك أو أُغلق أو توقف OrbStack:

- `getFile` للملفات الأكبر من ~20 م.ب يتوقف عبر جسر الماك
- المهام تبقى في انتظار صامت (`waiting_file`) ولا تُلغى
- الاستئناف يتم عند عودة الجسر **أو** عند ظهور البايتات في خزنة الغرفة / Drive

هذا **ليس** مساراً دائماً 24/7.

### تثبيت OrbStack على 1.5.1 (هذا الماك)

```bash
npm run orbstack:pin
# أو: ./scripts/pin-orbstack-1.5.1.sh
```

يعطّل فحوصات التحديث التلقائي لـ Sparkle (`SUEnableAutomaticChecks=0`). لا تعتمد على الترقية من واجهة OrbStack إن أردت البقاء على 1.5.1.

## ما الذي يبقى يعمل بدون الماك؟

على CranL دائماً:

1. استلام الرسالة + حفظ البيانات الوصفية
2. طابور مهمة صامت (رسالة واحدة صادقة — بلا «أعد الإرسال» ثلاث مرات)
3. البحث في **خزنة الغرفة** و **Drive** بنفس الاسم حرفياً
4. تنفيذ المهمة وإرسال الناتج عندما تتوفر البايتات

`/status` يعرض hops الحية: Local Bot API · جسر الماك · MTProto.

## المسار الدائم المستحسن: Bot API على أي جهاز دائماً يعمل

شغّل نفس الحاوية على **VPS / كمبيوتر مكتبي لا ينام / Raspberry Pi**، ثم اربط CranL مباشرة:

| متغير على CranL | القيمة |
|-----------------|--------|
| `TELEGRAM_BOT_API_URL` | `https://botapi.your-host.example` (نفق HTTPS إلى منفذ 8081) |
| `TELEGRAM_BOT_TOKEN` | نفس توكن `@alhuda14bot` (موجود أصلاً) |
| `MAC_SYNC_URL` | اختياري — OCR / MTProto / خزنة الماك عند الاستيقاظ |
| `MAC_SYNC_SECRET` | إن استخدمت جسر الماك |

لا حاجة لمفاتيح VPS مدفوعة من المستودع — أي مضيف لديك يكفي.

### أمر واحد (من المستودع)

```bash
# على الجهاز الدائم (أو الماك المستيقظ)
export TELEGRAM_API_ID=…      # من https://my.telegram.org
export TELEGRAM_API_HASH=…
# أو انسخ deploy/telegram-bot-api/.env.example → .env

npm run telegram:bot-api-setup
# = ./scripts/setup-always-on-bot-api.sh
# يستمع على 127.0.0.1:8081 + يثبت OrbStack إن وُجد
```

### تعريض HTTPS (مثال)

- Cloudflare Tunnel / Caddy / nginx / Tailscale Funnel → `https://…` → `127.0.0.1:8081`
- على CranL: `TELEGRAM_BOT_API_URL=https://…` (بدون شرطة مائلة أخيرة)

اختبار سريع من الجهاز الدائم:

```bash
curl -sS "http://127.0.0.1:8081/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

### جسر الماك (failover بينما الجهاز مستيقظ)

```bash
npm run storage:sync:up
# يعيد تشغيل الوكيل + يطبع URL النفق لتحديث MAC_SYNC_URL على CranL
```

إن انقطع النفق السريع (trycloudflare) بعد نوم الماك أو تغيير الشبكة: أعد `storage:sync:up` وحدّث `MAC_SYNC_URL`.

### ترتيب failover في الكود

1. `TELEGRAM_BOT_API_URL` (VPS دائماً أو OrbStack عندما الماك مستيقظ)
2. `MAC_SYNC_URL` → `/telegram/fetch-file` (Bot API محلي ثم MTProto)
3. سحابة `api.telegram.org` (~20 م.ب)
4. غرفة الفريق / Drive → استئناف المهام

### Drive / المالك

`DRIVE_BRAIN_OWNER_USER_ID` / `TELEGRAM_OWNER_USER_ID` / `CHANNEL_OWNER_USER_ID` على CranL — إن غابت يُستنتج من صف Google OAuth لـ `ryodan71@gmail.com`.

التفاصيل التقنية: [telegram-local-bot-api.md](./telegram-local-bot-api.md) · [deploy/telegram-bot-api/README.md](../deploy/telegram-bot-api/README.md)
