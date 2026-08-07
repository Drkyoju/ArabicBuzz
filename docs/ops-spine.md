# Ops spine — Arabic Buzz (Netlify + private bridges)

Live site only for QA: **https://arabicbuzz.netlify.app/**

This doc covers in-repo wiring for observability, remote MCP, Mac/VPS bridges, and browser RPA. Skipped / tombstoned: Moyasar, WhatsApp product UI, Qoyod, NVG, Signit, TokenRouter revival, self-hosted Langfuse on Netlify, fabricated demo data.

## A. Langfuse Cloud (optional — not self-host on Netlify)

**Free path:** leave keys empty. OTel stays no-op; product already records actions in the SDAIA-neutral audit log. Self-host on Netlify is skipped.

**Optional free hobby signup** (no paid plan required; often no credit card): [cloud.langfuse.com](https://cloud.langfuse.com) (EU) or [us.cloud.langfuse.com](https://us.cloud.langfuse.com). Paste keys → Redeploy.

Wiring (when keys present): `instrumentation.ts` + `@vercel/otel` via `lib/observability/langfuse.ts` → OTLP HTTP.

| Env | Notes |
|-----|--------|
| `LANGFUSE_PUBLIC_KEY` | Optional |
| `LANGFUSE_SECRET_KEY` | Optional |
| `LANGFUSE_HOST` or `LANGFUSE_BASEURL` / `LANGFUSE_BASE_URL` | Default `https://cloud.langfuse.com` |

Serverless flush: chat/agent paths call `scheduleOtelFlush()` / `forceFlushOtel()` when configured.

Status UI (directors): **يحتاج مفتاح مجاني من cloud.langfuse.com** until keys exist — not treated as a broken core service.

## B. MCP Toolbox (googleapis / genai-toolbox)

`@modelcontextprotocol/server-postgres` is dead — do not use it.

Catalog id `postgres` points at [googleapis/mcp-toolbox](https://github.com/googleapis/mcp-toolbox). When `MCP_TOOLBOX_URL` is set, Netlify auto-connects (Streamable HTTP, typically `https://host/mcp`).

### Deploy Toolbox (you own the container)

In-repo package: [`deploy/toolbox`](../deploy/toolbox/README.md) (Compose + Fly/Railway scripts). Prefer read-only SQL tools (`--prebuilt postgres/data`).

```bash
cd deploy/toolbox
./scripts/env-from-database-url.sh   # from DATABASE_URL → POSTGRES_*
docker compose up -d                 # local/VPS → http://127.0.0.1:5000/mcp
# or: ./scripts/deploy-fly.sh
# or: ./scripts/deploy-railway.sh
```

Upstream image example:

```bash
# https://github.com/googleapis/mcp-toolbox
docker run --rm -p 5000:5000 \
  -e POSTGRES_HOST=… \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DATABASE=… \
  -e POSTGRES_USER=… \
  -e POSTGRES_PASSWORD=… \
  -e POSTGRES_QUERY_PARAMS=sslmode=require \
  us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:1.8.0 \
  --prebuilt postgres/data --address 0.0.0.0 --port 5000
```

Netlify (after public HTTPS host exists):

```env
MCP_TOOLBOX_URL=https://your-toolbox-host/mcp
```

Local Mac stdio (not Netlify):

```bash
npx -y @toolbox-sdk/server --prebuilt=postgres --stdio
```

Guidance: keep tools **read-only** for association staff reports unless HITL/RBAC is intentional.

## C. Ops bridge / Supergateway

Package: [`packages/ops-bridge`](../packages/ops-bridge/README.md)

- Mac product path: `npm run storage:sync` → `MAC_SYNC_URL` + `MAC_SYNC_SECRET`
- Stdio MCPs → HTTP: `node packages/ops-bridge/bin/ab-ops-bridge.mjs <preset>`
- Health: `node packages/ops-bridge/bin/healthcheck.mjs` or `GET $MAC_SYNC_URL/health`

| Env | Role |
|-----|------|
| `MAC_SYNC_URL` | Vault, `/task`, `/markitdown`, `/health` |
| `BROWSER_USE_URL` | Dedicated browser-use (optional) |
| `MCP_REMOTE_SERVERS` | JSON `[{id,name,url}]` |
| `MCP_GITHUB_URL` | GitHub via Supergateway |
| `MCP_TOOLBOX_URL` | Toolbox `/mcp` |

## D. browser_rpa failover

Order: **BROWSER_USE_URL → MAC_SYNC_URL → STEEL_API_KEY**. Unreachable hops fall through. Tool is HITL-gated (`lib/security/posture.ts`).

Arabic errors tell operators which env to set. Catalog: `browser-use`, `playwright` (fallback), `steel` (cloud).

## D2. Cua Driver bridge (optional computer/browser use)

Open-source [trycua/cua](https://github.com/trycua/cua) — **not** inside Netlify Functions.

1. Install: https://cua.ai/cua-driver
2. `cua-driver serve` + `npm run cua:bridge` (HTTP → `cua-driver call`)
3. Tunnel → `CUA_BRIDGE_URL` + `CUA_BRIDGE_SECRET` (may reuse `MAC_SYNC_SECRET`)
4. Agent tool: `cua_computer` (HITL for input/navigation). Status: `/api/cua/status`, integrations status `cuaStatusAr`.

See [`docs/cua-bridge.md`](./cua-bridge.md).

## E. MarkItDown

- Mac agent: `POST /markitdown` (used by `read_decision_document`)
- Optional Supergateway preset: `markitdown` in ops-bridge
- Not exposed on the public internet without your tunnel + secret

## F. Web search & crawl (free path first)

| Capability | Free (no key) | Optional upgrade |
|------------|---------------|------------------|
| `web_search` | DuckDuckGo HTML/lite → Wikipedia (ar/en) → `site:gov.sa` | `BRAVE_API_KEY` ([free-tier signup](https://api-dashboard.search.brave.com)) |
| `web_fetch` / `ingest_url_to_brain` | [Jina Reader](https://r.jina.ai/) (`r.jina.ai/{url}`) → plain fetch | `FIRECRAWL_API_KEY` (paid-leaning) |

Do **not** set fake keys on Netlify. Firecrawl MCP auto-connects only when a key exists. Anybrowse remains opt-in (`MCP_AUTO_ANYBROWSE=1`).

## G. Integrations status

`/api/integrations/status` reports (no secrets): free-path readiness + Arabic labels (`braveStatusAr`, `firecrawlStatusAr`, `langfuseStatusAr`), Langfuse/Brave/Firecrawl booleans, MCP Toolbox, Mac bridge, **Cua bridge** (`cuaBridgeConfigured`, `cuaBridgeOnline`, `cuaStatusAr`), Steel, browser RPA. TokenRouter/Kimi is retired (`tokenrouterAvailable: false`).

UI labels: **مجاني مدمج** vs **اختياري بمفتاح** — search/crawl are ready without Brave/Firecrawl.

## H. GitHub MCP (optional)

Do not run GitHub stdio inside Netlify. Use:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN=… OPS_BRIDGE_PORT=8002 \
  node packages/ops-bridge/bin/ab-ops-bridge.mjs github
# Netlify: MCP_GITHUB_URL=https://tunnel/mcp
```

## Evals

```bash
npm run test:evals              # offline CI gate (+ Arabic FC when live keys)
npm run test:evals:arabic-fc    # MSA function-calling subset only
npm run evals:fetch-arabic-fc   # regenerate vendor subset from HF
```

## External deploy checklist (operator)

1. Core app keys (models / DB / auth) — search & crawl work without Brave/Firecrawl
2. **MCP Toolbox** container (Fly/Railway/VPS via `deploy/toolbox`) + `MCP_TOOLBOX_URL` (if needed)
3. **Mac bridge** (`storage:sync` + ngrok/Cloudflare tunnel) + `MAC_SYNC_*` (if needed)
4. **Cua bridge** (optional): `cua-driver serve` + `npm run cua:bridge` + `CUA_BRIDGE_*` — see `docs/cua-bridge.md`
5. Optional free signups (no pressure): Langfuse hobby · Brave free tier
6. Optional paid-leaning: `FIRECRAWL_API_KEY`, `STEEL_API_KEY`, `BROWSER_USE_URL`
7. Redeploy Netlify → verify صحة التشغيل — search/crawl should show **مجاني مدمج**
8. **Hourly cron:** GitHub Actions [`.github/workflows/cron-runner.yml`](../.github/workflows/cron-runner.yml) → `POST /api/crons/runner` with `CRON_SECRET` (must match Netlify). Repo secret `CRON_SECRET` is required; trigger manually via Actions → Cron runner → Run workflow.
9. **Auth wall:** Netlify `AUTH_REQUIRED=true` (production + previews) — director allow-list still includes `ryodan71@gmail.com` when signed in
