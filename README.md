# Arabic Buzz

منصة وكيل عربية (RTL) للمساحات الشخصية والمشتركة مع موافقات بشرية، سوق مهارات سعودية، سجل تدقيق، ووضع محلي مغلق (Air-Gapped).

## Stack

- Next.js 15 App Router + TypeScript + Tailwind CSS v3 (`tailwindcss-rtl`)
- Prisma + PostgreSQL
- Vercel AI SDK multi-harness router:
  - **Cloud (picker):** Gemini, GLM (Z.AI), AgentRouter (Opus / GPT)
  - **Air-gap:** Ollama only
  - **Retired:** Kimi/TokenRouter, Perplexity, OpenAI, OpenRouter UI keys
- OpenClaw `SKILL.md` registry + Hermes skill distillation
- Grammy (Telegram) + WhatsApp Cloud API
- Whisper STT + OpenAI TTS

Pick the active model from the header **النموذج** dropdown. In air-gap mode only Ollama-safe models remain available.

## Setup

```bash
cp .env.example .env.local
# املأ المفاتيح ثم:
npm install
npx prisma generate
npx prisma migrate dev
```

### Supabase (Auth + HITL + WhatsApp log)

See [`supabase/README.md`](supabase/README.md). Short path:

1. Create a Supabase project and paste URL / anon / service_role into `.env.local`.
2. Set `DATABASE_URL` to the project Postgres URI.
3. Apply schema:

```bash
npm run setup:supabase
```

4. Dashboard → Authentication → enable **Google** + **Apple**, redirect  
   `https://arabicbuzz.netlify.app/auth/callback` only.

## Mac vault + company brain (large files)

Source of truth on your Mac (`~/ArabicBuzz/data`); teammates use the Netlify site.

1. On the Mac (keep running):

```bash
MAC_SYNC_SECRET=your-secret npm run storage:sync
# tunnel, e.g.:
npx ngrok http 7420
```

2. Netlify env:

- `MAC_SYNC_URL` / `NEXT_PUBLIC_MAC_UPLOAD_URL` = tunnel URL
- `MAC_SYNC_SECRET` = same secret
- `BRAIN_PRIMARY=mac`

3. Uploads above ~32MB go **direct** to Mac `/upload` (up to `MAC_MAX_UPLOAD_BYTES`, default 8GB). Search/ingest proxy to the Mac while it is online. Settings → «خزنة الماك» shows agent status.

4. **Shared Mac drive:** coworkers use **ملفات** to upload, download, rename, replace, and delete — all operations hit your Mac vault through the tunnel (`GET|PUT|PATCH|DELETE /files/:id`). Keep `npm run storage:sync` running.

5. **Google Drive company brain:** set `GOOGLE_DRIVE_BRAIN_FOLDER_ID` (default: [ملفات الجمعية](https://drive.google.com/drive/folders/1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW?usp=sharing)). Connect Google in Settings (includes `drive.readonly`), then **مزامنة المجلد → عقل الشركة**. Enable Drive API in Google Cloud. Sync is HITL-gated via `drive_sync_brain`.

## Cua Driver bridge (optional computer / browser use)

Open-source [Cua](https://github.com/trycua/cua) — runs on **your desktop**, not inside Netlify. See [`docs/cua-bridge.md`](docs/cua-bridge.md).

```bash
# install from https://cua.ai/cua-driver
cua-driver serve
CUA_BRIDGE_SECRET=your-secret npm run cua:bridge
npx ngrok http 7430
```

Netlify: `CUA_BRIDGE_URL` + `CUA_BRIDGE_SECRET`. UI: حالة الربط → «جسر Cua» (متصل / غير متصل).

## Verify secrets

```bash
npm run verify:env
# أو بدون شبكة:
npx tsx scripts/verify-env.ts --offline
```

## Production site

Live app: [https://arabicbuzz.netlify.app](https://arabicbuzz.netlify.app)

Set `NEXT_PUBLIC_APP_URL=https://arabicbuzz.netlify.app` on Netlify. Invites, auth, and emails always use this origin (never a local URL).

وجّه Telegram / Meta إلى:

- `https://arabicbuzz.netlify.app/api/webhooks/telegram`
- `https://arabicbuzz.netlify.app/api/webhooks/whatsapp`

لتسجيل webhook تيليجرام مع `secret_token` (موصى به إن وُجد `TELEGRAM_WEBHOOK_SECRET`):

```bash
npx tsx scripts/set-telegram-webhook.ts
```

البوت الواحد يدعم: دردشة الوكيل، الصوت، `/approve` للمعلّق، وأزرار موافقة/رفض التي **تنفّذ** الإجراء بعد القرار.

## Multiplayer simulation

```bash
npm run test:multiplayer
```

## Cron

جدولة خارجية (Netlify Scheduled Function / cron-job.org / GitHub Actions) تستدعي مسارات Next.js — لا يوجد daemon داخل الدالة:

```bash
# كل ساعة: نبضات + مهام مجدولة + ملخص المدير يوم الخميس (توقيت الرياض)
curl -X POST https://arabicbuzz.netlify.app/api/crons/runner \
  -H "Authorization: Bearer $CRON_SECRET"

# ملخص «ما ينتظر قرارك» فقط (الخميس؛ أو force=1)
curl -X POST "https://arabicbuzz.netlify.app/api/crons/director-digest?force=1" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

متغيرات Netlify للملخص: `DIRECTOR_EMAIL` أو `DIGEST_EMAIL`، `RESEND_API_KEY`، `RESEND_FROM`، واختياري `DIGEST_NAME_AR` + تيليجرام.

## Evaluation benchmark

```bash
npm run test:evals           # offline-capable CI gate (+ Arabic FC when live keys)
npm run test:evals -- --live # Agent Orchestrator + LLM-as-Judge when keys exist
npm run test:evals:arabic-fc # MSA function-calling subset (HeshamHaroon)
npm run evals:fetch-arabic-fc # regenerate vendored subset from Hugging Face
```

Fails with exit code `1` if overall `Accuracy < 90%`. Metrics: `ToolSelectionAccuracy`, `ArabicSyntaxScore`, `SafetyPassRate`. Arabic FC suite skips offline when no provider key is set.

## Ops spine (Langfuse · Toolbox · Mac bridge)

See **[docs/ops-spine.md](docs/ops-spine.md)** and **`packages/ops-bridge`**.

```bash
npm run ops:bridge -- list          # Supergateway presets (filesystem, github, …)
npm run storage:sync                # Mac agent: /health /task /markitdown
npm run ops:health                  # probe MAC_SYNC_URL / Toolbox
```

Free path (no keys): `web_search` (DuckDuckGo / Wikipedia / gov.sa) and URL ingest (Jina Reader / fetch). Optional: `LANGFUSE_*` (free hobby), `BRAVE_API_KEY` (free tier), `FIRECRAWL_API_KEY` (upgrade). Also: `MCP_TOOLBOX_URL`, `MAC_SYNC_URL`, `CUA_BRIDGE_URL`, `BROWSER_USE_URL`, `STEEL_API_KEY`. Kimi/TokenRouter and Perplexity are retired from the picker.

## Multi-tenant RBAC + RLS

Org roles: `OWNER` · `ADMIN` · `DEPARTMENT_MANAGER` · `MEMBER` · `AUDITOR`

```bash
psql "$DATABASE_URL" -f supabase/migrations/004_rbac_rls.sql
```

Sensitive actions call `hasPermission` / `assertPermission` (`lib/auth/rbac.ts`) and return:
`عفواً، لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء.`

Pass tenant context via `x-user-id` / `x-org-id` headers (or body `userId` / `orgId`):
- Install skill → `DEPARTMENT_MANAGER+`
- Delete thread → `ADMIN+`
- Approve high-risk → `ADMIN+`

RLS on `session_threads`, `scope_memories`, `pending_approvals`, `sdaia_audit_logs` (view `audit_logs`) uses `scope_permissions` + `app.current_user_id()` / `app.current_org_id()` (compatible with Supabase Auth `auth.uid()`).

## Arabic Hybrid RAG

PostgreSQL `pgvector` + Arabic FTS (`to_tsquery('arabic', …)`) + Reciprocal Rank Fusion.

```bash
# Apply schema (pgvector required)
psql "$DATABASE_URL" -f supabase/migrations/003_arabic_rag.sql
# or: npx prisma migrate deploy
```

Set `COHERE_API_KEY` (default) or `EMBEDDING_PROVIDER=bge-m3` with a local OpenAI-compatible embeddings endpoint. Agent tool: `search_knowledge_base` (`queryAr`).

## MCP Client Host

Connect external MCP servers (stdio or SSE/HTTP) and expose their tools to the agent engine alongside native tools.

```bash
# List connected servers + tools
curl https://arabicbuzz.netlify.app/api/mcp/servers

# Connect GitHub MCP (stdio example)
curl -X POST https://arabicbuzz.netlify.app/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "github",
    "name": "GitHub",
    "transport": "stdio",
    "commandOrUrl": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
  }'

# Connect PostgreSQL via MCP Toolbox (googleapis/mcp-toolbox)
# NOTE: @modelcontextprotocol/server-postgres was removed upstream — do not use it.
curl -X POST https://arabicbuzz.netlify.app/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "postgres",
    "name": "PostgreSQL",
    "transport": "stdio",
    "commandOrUrl": "npx",
    "args": ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"],
    "env": {
      "POSTGRES_HOST": "db.example.com",
      "POSTGRES_PORT": "5432",
      "POSTGRES_DATABASE": "postgres",
      "POSTGRES_USER": "postgres",
      "POSTGRES_PASSWORD": "..."
    }
  }'
```

Core files: `lib/mcp/client-manager.ts`, `lib/agents/engine.ts`, `app/api/mcp/servers/route.ts`.

## Air-gapped mode

اضبط `AIR_GAPPED_MODE=true` لفرض Ollama المحلي ومنع الاتصال الخارجي.
