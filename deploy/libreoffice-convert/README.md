# خدمة تحويل LibreOffice (مجانية · منفصلة عن CranL)

صورة CranL رقيقة (`INSTALL_LIBREOFFICE=0`) — لا تُثبَّت LibreOffice داخلها.
المسار المجاني الدائم: شغّل هذه الحاوية على VPS / Fly / Railway / جهازك، ثم عيّن على CranL:

| متغير | مثال |
|--------|------|
| `CONVERT_SERVICE_URL` أو `LIBREOFFICE_URL` | `https://lo.example.com` |
| `CONVERT_SECRET` (اختياري لكن مُستحسن) | نفس `CONVERT_SECRET` في الحاوية |

## تشغيل محلي (أسرع اختبار)

من جذر المستودع:

```bash
export CONVERT_SECRET="$(openssl rand -hex 24)"
docker compose -f docker-compose.convert.yml up -d --build
curl -s http://127.0.0.1:8100/health
```

انشر عنواناً عاماً (Cloudflare Tunnel / Fly / Railway) ثم:

```bash
npm run cranl:put-env -- --restart \
  CONVERT_SERVICE_URL=https://YOUR_PUBLIC_HOST \
  CONVERT_SECRET="$CONVERT_SECRET"
```

## Fly.io (طبقة مجانية محدودة)

```bash
cd deploy/libreoffice-convert
# بعد fly auth login:
fly apps create arabicbuzz-lo-convert --org personal   # مرة واحدة
fly secrets set CONVERT_SECRET="$(openssl rand -hex 24)"
fly deploy
# انسخ الرابط العام → CONVERT_SERVICE_URL على CranL
```

ملف `fly.toml` اختياري — أنشئه عند الحاجة بـ `fly launch --no-deploy` داخل هذا المجلد.

## سلسلة التحويل في المنتج

1. **خدمة بعيدة** (`CONVERT_SERVICE_URL` / `LIBREOFFICE_URL`) — أولاً عند الضبط  
2. **LibreOffice محلي** إن وُجد `soffice` في الحاوية  
3. **جسر الماك** (`MAC_SYNC_URL`) لـ PDF↔DOCX فقط إن كان مستيقظاً  
4. **رفض عربي صريح** — بلا ادّعاء نجاح ولا طلاسم  

CloudConvert اختياري مدفوع فقط إن وافقت على مفتاح.

## حدود صادقة

- حجم صورة LO كبير (~1GB+) — لذلك sidecar وليس داخل CranL.
- PDF عربي معطوب (ToUnicode) → مسار OCR/Drive أفضل من LO وحده.
- الطبقة المجانية على Fly/Railway قد تنام أو تُقيَّد — راقب `/health`.
