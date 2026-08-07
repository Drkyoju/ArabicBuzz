# جسر Cua (اختياري) — Computer / Browser Use

Arabic Buzz لا يشغّل [Cua Driver](https://cua.ai/cua-driver) داخل Netlify Functions. الجسر محلي/سطح مكتب مثل خزنة الماك و`browser-use`.

المستودع المفتوح: [trycua/cua](https://github.com/trycua/cua) (MIT).

## ماذا يعطيك؟

عندما يكون الجسر **متصلًا**، أداة الوكيل `cua_computer` توجّه إجراءات مثل:

- `browser_navigate` / `browser_click` / `browser_type` / `get_browser_state`
- `list_windows` / `get_window_state` / `click` / `type_text`
- `health_report`

إلى `cua-driver call …` على جهازك. بدون جسر تظهر رسالة صادقة:

> ثبّت Cua على جهازك ثم اربط العنوان هنا

## التثبيت (على جهازك)

### macOS / Linux

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
cua-driver --version
cua-driver doctor
```

على macOS: امنح Accessibility و Screen Recording عبر `cua-driver permissions grant` بعد تشغيل الـ daemon.

### Windows

```powershell
irm https://cua.ai/driver/install.ps1 | iex
```

## التشغيل المحلي

```bash
# 1) Daemon Cua (يحتفظ بحالة النوافذ/الجلسة)
cua-driver serve
# أو: open -n -g -a CuaDriver --args serve

# 2) جسر HTTP لـ Arabic Buzz
CUA_BRIDGE_SECRET=your-secret CUA_BRIDGE_PORT=7430 npm run cua:bridge

# 3) نفق عام
npx ngrok http 7430
```

## ربط Netlify

| المتغير | المعنى |
|---------|--------|
| `CUA_BRIDGE_URL` | رابط النفق (بدون `/` نهائي) |
| `CUA_BRIDGE_SECRET` | نفس سر الجسر المحلي (يمكن إعادة استخدام `MAC_SYNC_SECRET`) |

Redeploy بعد الضبط. افحص:

- الواجهة: **حالة الربط** / الإعدادات → «جسر Cua»
- `GET /api/integrations/status` → `cuaBridgeConfigured` / `cuaBridgeOnline` / `cuaStatusAr`
- `GET /api/cua/status` (يتطلب جلسة)
- `GET /api/health/free` → حقول Cua

## الاستخدام من المساعدين

- المساعد العام والأدوات عالية المخاطر تمر عبر HITL عند تفعيل الموافقات (`cua_computer` في قائمة الخطر العالي؛ إجراءات القراءة مثل `health_report` أخف).
- اطلب بالعربية مثلًا: «افتح الصفحة … وانقر …» — إن كان الجسر متصلًا يستخدم `cua_computer`.

## MCP المحلي (اختياري، خارج Arabic Buzz)

للتطوير على الجهاز نفسه (Cursor / Claude)، Cua يوفّر stdio MCP:

```bash
cua-driver mcp-config --client cursor
# أو: cua-driver mcp
```

هذا **لا** يستبدل `CUA_BRIDGE_URL` للموقع السحابي — الموقع يحتاج النفق + `npm run cua:bridge`.

## حدود صادقة

- لا تدّعي الواجهة «تحكم سطح مكتب طاقة» بدون جسر متصل.
- جودة computer-use تعتمد على تثبيت Cua وصلاحيات النظام على جهازك.
- `cua-driver serve` ليس خادم HTTP عامًا؛ الجسر عندنا هو الوكيل الرقيق الذي يستدعي CLI/MCP.
