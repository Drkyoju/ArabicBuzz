# Arabic Buzz

منصة وكيل عربية (RTL) للمساحات الشخصية والمشتركة مع موافقات بشرية، سوق مهارات سعودية، تدقيق SDAIA، ووضع محلي مغلق (Air-Gapped).

## Stack

- Next.js 15 App Router + TypeScript + Tailwind CSS v3 (`tailwindcss-rtl`)
- Prisma + PostgreSQL
- Vercel AI SDK multi-harness router:
  - **Direct:** OpenAI GPT-4o / Mini, Gemini 2.0 Flash / 2.5 Pro, Ollama, Perplexity
  - **Via OpenRouter:** Claude, DeepSeek, Kimi, GLM, Qwen, Hermes
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

## Multiplayer simulation

```bash
npm run test:multiplayer
```

## Cron

جدولة Netlify أو طلب موقّع:

```bash
curl -X POST https://arabicbuzz.netlify.app/api/crons/runner \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Evaluation benchmark

```bash
npm run test:evals           # offline-capable CI gate
npm run test:evals -- --live # Agent Orchestrator + LLM-as-Judge when keys exist
```

Fails with exit code `1` if overall `Accuracy < 90%`. Metrics: `ToolSelectionAccuracy`, `ArabicSyntaxScore`, `SafetyPassRate`.

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

# Connect PostgreSQL MCP (use your Supabase DATABASE_URL)
curl -X POST https://arabicbuzz.netlify.app/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "postgres",
    "name": "PostgreSQL",
    "transport": "stdio",
    "commandOrUrl": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "'"$DATABASE_URL"'"]
  }'
```

Core files: `lib/mcp/client-manager.ts`, `lib/agents/engine.ts`, `app/api/mcp/servers/route.ts`.

## Air-gapped mode

اضبط `AIR_GAPPED_MODE=true` لفرض Ollama المحلي ومنع الاتصال الخارجي.
