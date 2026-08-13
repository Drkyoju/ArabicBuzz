# Deploy ArabicBuzz on CranL

Primary production path is **CranL** (Docker / `next start` standalone). Live URL: **https://arabicbuzz-fooc9h.cranl.net/**

Netlify OpenNext remains in-repo as a fallback but is not the live QA target after cutover.

App id: `bf8cff03-49ac-4a80-bb93-298305e6617e`

## Prerequisites

- CranL account + API key (`cranl login`)
- GitHub connected to the project (`cranl github connect`)
- Env vars copied from Netlify / `.env.local` (never commit secrets)

## Reliable manual deploy (`npm run cranl:deploy`)

GitHub auto-deploy on push to `main` can lag or fail silently on Basic. Prefer this after every code push:

```bash
# Typecheck → cranl apps deploy <app-id> → poll /api/health/live + /api/health/ready
npm run cranl:deploy

# Faster (skip local tsc) when you already built clean:
npm run cranl:deploy -- --skip-build

# List history (CLI bug workaround):
npm run cranl:deployments
```

Script: `scripts/cranl-deploy.sh` · App id: `bf8cff03-49ac-4a80-bb93-298305e6617e` · Live: https://arabicbuzz-fooc9h.cranl.net/

Appointment reminders (narrow, digests stay silent):

```bash
# Ensure on CranL (already documented above):
# TELEGRAM_GROUP_APPOINTMENT_REMINDERS=1
# GitHub Actions: .github/workflows/appointment-reminders.yml → POST /api/crons/appointment-reminders
curl -sS https://arabicbuzz-fooc9h.cranl.net/api/crons/appointment-reminders
# → groupAppointmentReminders:true · willRun:true · silenceUnsolicited:true
```

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
# Cron (mail snooze / schedule send / reminders + digests): set CRON_SECRET on CranL
# to the same value as the GitHub Actions repo secret CRON_SECRET.
# Full suite workflow DISABLED by default: .github/workflows/cron-runner.yml
# Narrow appointment reminders (group opt-in, digests stay silent):
#   TELEGRAM_GROUP_APPOINTMENT_REMINDERS=1
#   Workflow: .github/workflows/appointment-reminders.yml
#     → POST /api/crons/appointment-reminders every ~15 min
# Optional owner DM while silence stays on: TELEGRAM_OWNER_CHAT_ID=<private chat id>
#
# Staff roles (no secrets):
# OWNER_EMAIL=ryodan71@gmail.com   # sole admin UI — optional if default
# EMPLOYEE_EMAILS=hd.hk1444920@gmail.com,hd.hk2023429@gmail.com
#   (optional — same addresses are built into the app; set when adding more staff)
```

Then redeploy: `cranl apps deploy <app-id>` (or push to `main`).

## List deployments (CLI bug workaround)

CranL CLI **v1.7.0** breaks on deployment history:

```text
cranl apps deployments list <app-id>
# → Error: deployments.map is not a function
```

**Cause:** `GET /api/applications/<id>/deployments` returns `{ "deployments": [ … ] }` with camelCase fields (`deploymentId`, `createdAt`, `title`, …). The CLI assumes a bare array with snake_case fields and calls `.map` on the object.

**Reliable workaround** (repo wrapper, no secrets printed):

```bash
npm run cranl:deployments
# or:
./scripts/cranl-deployments-list.sh
./scripts/cranl-deployments-list.sh --limit 5
./scripts/cranl-deployments-list.sh --json
```

Requires `CRANL_API_KEY` in the environment, `.env.local`, or `~/.cranl/config.json` (same as `cranl:put-env`).

Raw API (shape only — do not paste keys into chat/logs):

```bash
curl -sS -H "Authorization: Bearer $CRANL_API_KEY" -H "Accept: application/json" \
  "https://app.cranl.com/api/applications/bf8cff03-49ac-4a80-bb93-298305e6617e/deployments"
```

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

Dockerfile defaults `INSTALL_LIBREOFFICE=0` (thin image). Prefer a **free
always-on sidecar** instead of baking LO into CranL:

```bash
docker compose -f docker-compose.convert.yml up -d --build
# then public URL + secret on CranL:
# CONVERT_SERVICE_URL=https://…  CONVERT_SECRET=…
```

See [deploy/libreoffice-convert/README.md](../deploy/libreoffice-convert/README.md).
Fallback chain in app: remote convert → local soffice → mac-hop → refuse MSA.
Also free: **Google Drive** after OAuth (`drive.file`). Do not buy CloudConvert
unless you explicitly approve a paid key.

Optional heavy image (usually avoided on CranL):

```bash
docker build --build-arg INSTALL_LIBREOFFICE=1 -t arabicbuzz .
```

## QA (agents)

- **Only** live URL for product QA: https://arabicbuzz-fooc9h.cranl.net/
- App ID: `bf8cff03-49ac-4a80-bb93-298305e6617e`
- Do not use localhost, Netlify, or local preview for product QA.

