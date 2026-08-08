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
#
# Staff roles (no secrets):
# OWNER_EMAIL=ryodan71@gmail.com   # sole admin UI — optional if default
# EMPLOYEE_EMAILS=hd.hk1444920@gmail.com,hd.hk2023429@gmail.com
#   (optional — same addresses are built into the app; set when adding more staff)
```

Then redeploy: `cranl apps deploy <app-id>` (or push to `main`).

## After go-live

1. Point Telegram webhook:
   `NEXT_PUBLIC_APP_URL=https://arabicbuzz-fooc9h.cranl.net npx tsx scripts/set-telegram-webhook.ts`
2. Update GitHub Actions `.github/workflows/cron-runner.yml` `APP_URL` (already set to CranL).
3. Update Google OAuth / Supabase redirect URLs to include `arabicbuzz-fooc9h.cranl.net` (see `docs/google-oauth-ar.md`).
4. **Rotate** any API key that was pasted into chat.

## Smoke

- **Liveness (fast):** `GET /api/health/live` — process up; use for Docker/CranL HEALTHCHECK
- **Readiness:** `GET /api/health/ready` — cheap DB/Supabase check (503 if not ready)
- **Diagnostics:** `GET /api/health/free` — full free-stack flags (not for frequent probes)
- `GET https://arabicbuzz-fooc9h.cranl.net/api/webhooks/telegram`
- `GET https://arabicbuzz-fooc9h.cranl.net/api/public-config` → `supabaseConfigured: true`
- Login UI: `https://arabicbuzz-fooc9h.cranl.net/auth/login` must show Google / email buttons (not «غير جاهز»)

## Probes & graceful restart

CranL rebuilds the Docker image on push to `main`. There is no guaranteed zero-downtime rolling swap on Basic; expect a short window of 502 until the new container passes probes.

| Probe | URL | Interval guidance |
| --- | --- | --- |
| Liveness | `/api/health/live` | Every 10–15s, timeout 3s, start-period ≥20s |
| Readiness | `/api/health/ready` | Every 15–30s, timeout 3s; fail open traffic until 200 |
| Alias | `/api/health` | Same as live (convenience) |
| Deep | `/api/health/free` | Manual / ops only |

**Restart expectations**

1. Push `main` or `cranl apps deploy <app-id>` → new image build.
2. Old process receives SIGTERM (Node standalone exits); in-flight agent/webhook turns may abort — clients retry.
3. Container is healthy when `/api/health/live` returns 200; traffic should wait for `/api/health/ready` when the platform supports readiness separately.
4. Dockerfile embeds `HEALTHCHECK` against `/api/health/live`.
5. Avoid pointing load balancers at `/api/health/free` — it hits Supabase + Prisma and is slower/flakier during blips.

### Reduce deploy downtime (ops checklist)

1. **Wire platform probes** (CranL UI / app settings if available):
   - Liveness → `GET https://arabicbuzz-fooc9h.cranl.net/api/health/live`
   - Readiness → `GET https://arabicbuzz-fooc9h.cranl.net/api/health/ready`
2. **Do not cut traffic on liveness alone** — ready waits for Prisma or Supabase (`workspace_files` head). A 503 on ready means “not yet”; keep old container serving if the platform supports it.
3. **Start-period ≥ 25s** so Next standalone can boot before probes fail the container.
4. **Expect ~30–90s** of possible 502 on Basic single-instance rebuild; Telegram / clients should retry (bot never deletes messages).
5. **Env before deploy:** `STORAGE_BACKEND=cloud`, `NEXT_PUBLIC_APP_URL` / `APP_URL` = CranL hostname, Supabase service role present.
6. **After deploy:** smoke `live` → `ready` → `/api/public-config` → `/api/webhooks/telegram` before declaring green.
7. If CranL later exposes stop-grace / rolling restart, keep liveness on `live` and readiness on `ready` — do not invent a custom drain unless the platform documents one.

If CranL later exposes stop-grace / rolling restart in the UI, keep liveness on `live` and readiness on `ready` — do not invent a custom drain unless the platform documents one.

### Auth note (Docker / NEXT_PUBLIC_*)

Next.js inlines `NEXT_PUBLIC_*` at **build** time. CranL often only has env at **runtime**. The app injects public Supabase URL+anon via layout script + `/api/public-config` so login works without rebuild args. Dockerfile still accepts optional `ARG NEXT_PUBLIC_*` when the host can pass build args.

## Local Docker build (optional)

```bash
# Production-like (includes LibreOffice — larger image)
docker build -t arabicbuzz .
# Thin image without LibreOffice (rely on Google Drive convert):
docker build --build-arg INSTALL_LIBREOFFICE=0 -t arabicbuzz:slim .
docker run --rm -p 3000:3000 --env-file .env.local arabicbuzz
```

### LibreOffice on CranL

Dockerfile defaults `INSTALL_LIBREOFFICE=0` (thin image). CranL builds with
LibreOffice enabled failed on recent deploys (~1 min error — host/platform;
not confirmed as package-size alone). Free convert without LO: **Google Drive**
after linking OAuth (`drive.file`).

To try LO again when the host allows a larger image:

```bash
docker build --build-arg INSTALL_LIBREOFFICE=1 -t arabicbuzz .
```

After a successful LO image, `GET /api/health/free` should show `libreOfficeOk: true`.
Do not buy CloudConvert unless you explicitly approve a paid key.

## QA (agents)

- **Only** live URL for product QA: https://arabicbuzz-fooc9h.cranl.net/
- App ID: `bf8cff03-49ac-4a80-bb93-298305e6617e`
- Do not use localhost, Netlify, or local preview for product QA.

