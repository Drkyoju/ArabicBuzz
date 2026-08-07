# Deploy ArabicBuzz on CranL

Primary production path is **CranL** (Docker / `next start` standalone). Live URL: **https://arabicbuzz-fooc9h.cranl.net/**

Netlify OpenNext remains in-repo as a fallback but is not the live QA target after cutover.

App id: `bf8cff03-49ac-4a80-bb93-298305e6617e`

## Prerequisites

- CranL account + API key (`cranl login`)
- GitHub connected to the project (`cranl github connect`)
- Env vars copied from Netlify / `.env.local` (never commit secrets)

## One-time create

```bash
cranl projects select <project-id>
# repo id from: curl ... /api/github/sync?projectId=...
cranl apps create --repo <github-repo-id> --name arabicbuzz --build-type dockerfile --region germany --branch main
```

Or dashboard: Applications → New Application → `Drkyoju/ArabicBuzz` → Build Type **Dockerfile** → region **Germany** (MENA requires Pro).

## Env

```bash
# From a sanitized env file (no CRANL_API_KEY in git).
# Note: `cranl apps env push` currently hits POST→405; use PUT via API:
#   curl -X PUT -H "Authorization: Bearer $CRANL_API_KEY" -H "Content-Type: application/json" \
#     --data-binary @<(python3 -c 'import json,pathlib; print(json.dumps({"env": pathlib.Path(".env.cranl.local").read_text()}))') \
#     https://app.cranl.com/api/applications/<app-id>/environment
#
# Or dashboard → Application → Environment → Raw mode.
cranl apps env set <app-id> KEY=VALUE   # may also 405; prefer dashboard/API PUT
```

```bash
# Always set public URL to the CranL hostname after first deploy:
# NEXT_PUBLIC_APP_URL / APP_URL = https://arabicbuzz-fooc9h.cranl.net
```

Then redeploy: `cranl apps deploy <app-id>` (or push to `main`).

## After go-live

1. Point Telegram webhook:
   `NEXT_PUBLIC_APP_URL=https://arabicbuzz-fooc9h.cranl.net npx tsx scripts/set-telegram-webhook.ts`
2. Update GitHub Actions `.github/workflows/cron-runner.yml` `APP_URL` (already set to CranL).
3. Update Google OAuth / Supabase redirect URLs to include `arabicbuzz-fooc9h.cranl.net` (see `docs/google-oauth-ar.md`).
4. **Rotate** any API key that was pasted into chat.

## Smoke

- `GET https://arabicbuzz-fooc9h.cranl.net/api/health/free`
- `GET https://arabicbuzz-fooc9h.cranl.net/api/webhooks/telegram`

## Local Docker build (optional)

```bash
docker build -t arabicbuzz .
docker run --rm -p 3000:3000 --env-file .env.local arabicbuzz
```

Do not use localhost for product QA — use the CranL URL only.
