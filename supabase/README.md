# Supabase — Arabic Buzz

SQL under `migrations/` is the source of truth for hosted Supabase (and local `supabase start`). Prisma mirrors the same core schema for app queries.

## Migration order

| File | Purpose |
|------|---------|
| `001_init_core.sql` | Core tables (scopes, threads, approvals, audit, …) |
| `003_arabic_rag.sql` | `pgvector` + `knowledge_documents` (Arabic FTS + HNSW) |
| `004_rbac_rls.sql` | Org RBAC + RLS (`app.current_user_id`, never overwrite Supabase `auth.uid()`) |
| `005_whatsapp_and_auth.sql` | WhatsApp logs, approval columns, `profiles` + Auth trigger |

## One-command setup (when `DATABASE_URL` points at Supabase Postgres)

```bash
# Fill .env.local first (see below), then:
npm run setup:supabase
npm run setup:supabase -- --check   # keys + DB ping only
```

## Cloud project (dashboard)

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Settings → API** — copy into `.env.local` / Netlify:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server only — never expose to the browser
```

3. **Settings → Database → Connection string (URI)** → set as `DATABASE_URL` (Prisma + `setup:supabase`).
4. Run `npm run setup:supabase` (or paste each migration in **SQL Editor** in order).
5. Enable **pgvector** if the migration fails on `CREATE EXTENSION vector` (Database → Extensions).

## Auth: Google + GitHub (team login)

Anyone on your team can sign in; **model API keys stay on Netlify** (shared server-side). Coworkers do not need their own Gemini/OpenAI keys.

> **Arabic ops checklist (consent screen, publish, test users):** see [`docs/google-oauth-ar.md`](../docs/google-oauth-ar.md).

### Login vs workspace scopes

- **Sign-in** uses Google identity only (`openid email profile`) — avoids Google’s “unverified app” scare screens on every login.
- **Calendar / Gmail / Drive** are linked later via «ربط تقويم Google» (`connectGoogleCalendar()`), which still requests sensitive scopes and may show verification warnings until Google verifies the OAuth app.
- **Email OTP** is a first-class alternative on `/auth/login` (no Google required).
- Privacy policy URL for the consent screen: `https://arabicbuzz-fooc9h.cranl.net/privacy`

### 1) Supabase URL config

**Authentication → URL Configuration**

- **Site URL:** `https://arabicbuzz-fooc9h.cranl.net`
- **Redirect URLs:**
  - `https://arabicbuzz-fooc9h.cranl.net/auth/callback`
  - (optional fallback) `https://arabicbuzz.netlify.app/auth/callback`

### 2) Google (Gmail)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create **OAuth client ID** (Web).
2. Authorized redirect URI (exact):

   `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`

3. Supabase → **Authentication → Providers → Google** → enable → paste Client ID + Secret.
4. In [Google Cloud Console](https://console.cloud.google.com/) enable **Google Calendar API**, **Gmail API**, **Google Sheets API**, and **Google Drive API**.
5. OAuth consent screen → App name **Arabic Buzz**, home `https://arabicbuzz-fooc9h.cranl.net/`, privacy `https://arabicbuzz-fooc9h.cranl.net/privacy`, then **Publish app** (see Arabic checklist).
6. OAuth consent screen → add scopes (needed only for workspace link, not basic login):
   - `.../auth/calendar`
   - `.../auth/calendar.events`
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.send`
   - `.../auth/spreadsheets`
   - `.../auth/drive.readonly`
   - `.../auth/drive.file`
7. On CranL set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (same client as Supabase) so Calendar tokens can refresh.
8. In the app: **الإعدادات → ربط تقويم Google**. Chat tools can then create/update/delete events, search/read/send Gmail, and read/write Sheets (`gmail_send` / Sheets writes go through HITL in AUTO/STRICT). Re-link after scope changes (e.g. adding `gmail.send`) so Google re-consents.

### 3) GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Homepage URL: `https://arabicbuzz-fooc9h.cranl.net`
   - Authorization callback URL:

     `https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback`

2. Supabase → **Authentication → Providers → GitHub** → enable → paste Client ID + Secret.

### 4) Mac vault (optional, large files + local brain)

On your Mac: `npm run storage:sync` + a public tunnel. On CranL set `MAC_SYNC_URL`, `MAC_SYNC_SECRET`, `NEXT_PUBLIC_MAC_UPLOAD_URL`, and `BRAIN_PRIMARY=mac`. See root README «Mac vault».

### 5) Shared models on Netlify

Set at least one (Site → Environment variables), then redeploy:

- `GEMINI_API_KEY` and/or
- `OPENROUTER_API_KEY` and/or
- `OPENAI_API_KEY`

App routes: `/auth/login`, `/auth/callback` (PKCE), `/privacy`. Chat API requires a signed-in session.

## Auth: Google + Apple (legacy note)

Apple is optional; the UI uses **Google + email OTP + GitHub**. If you previously enabled Apple, you can leave it on in Supabase without harm.

## Local Supabase (Docker / OrbStack)

```bash
npx supabase start          # prints local URL + anon/service keys
npx supabase db reset       # applies migrations/*
# copy keys into .env.local, set DATABASE_URL to the printed DB URL (port 54322 by default)
```

## CLI link to an existing cloud project

```bash
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase db push
```
