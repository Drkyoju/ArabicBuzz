# Ops spine — Arabic Buzz (Netlify + private bridges)

Live site only for QA: **https://arabicbuzz.netlify.app/**

This doc covers in-repo wiring for observability, remote MCP, Mac/VPS bridges, and browser RPA. Skipped / tombstoned: Moyasar, WhatsApp product UI, Qoyod, NVG, Signit, TokenRouter revival, self-hosted Langfuse on Netlify, fabricated demo data.

## A. Langfuse Cloud (not self-host on Netlify)

Arabic Buzz already registers OpenTelemetry via `instrumentation.ts` + `@vercel/otel`. When Langfuse keys are present, `lib/observability/langfuse.ts` maps them to OTLP HTTP:

| Env | Notes |
|-----|--------|
| `LANGFUSE_PUBLIC_KEY` | Required |
| `LANGFUSE_SECRET_KEY` | Required |
| `LANGFUSE_HOST` or `LANGFUSE_BASEURL` / `LANGFUSE_BASE_URL` | Default `https://cloud.langfuse.com` (US: `https://us.cloud.langfuse.com`) |

Serverless flush: chat/agent paths call `scheduleOtelFlush()` / `forceFlushOtel()` so Netlify does not drop spans.

**You must:** create a Langfuse Cloud project and paste keys into Netlify → Redeploy. Do not run Langfuse as a Netlify function.

Status UI: Integrations / صحة التشغيل → **Langfuse**.

## B. MCP Toolbox (googleapis / genai-toolbox)

`@modelcontextprotocol/server-postgres` is dead — do not use it.

Catalog id `postgres` points at [googleapis/mcp-toolbox](https://github.com/googleapis/mcp-toolbox). When `MCP_TOOLBOX_URL` is set, Netlify auto-connects (Streamable HTTP, typically `https://host/mcp`).

### Deploy Toolbox (you own the container)

Example (Fly / Railway / any Docker host) — read-only SQL tools preferred:

```bash
# Pull / build from upstream docs, then expose Streamable HTTP
# https://github.com/googleapis/mcp-toolbox
docker run --rm -p 5000:5000 \
  -e POSTGRES_HOST=… \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DATABASE=… \
  -e POSTGRES_USER=… \
  -e POSTGRES_PASSWORD=… \
  us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:latest \
  --prebuilt postgres --address 0.0.0.0 --port 5000
```

Netlify:

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

## E. MarkItDown

- Mac agent: `POST /markitdown` (used by `read_decision_document`)
- Optional Supergateway preset: `markitdown` in ops-bridge
- Not exposed on the public internet without your tunnel + secret

## F. Firecrawl

Prefer `FIRECRAWL_API_KEY` (native scrape in `ingest_url_to_brain`). Optional MCP: auto-connect when key set (`FIRECRAWL_MCP_URL` override). Anybrowse is opt-in (`MCP_AUTO_ANYBROWSE=1`) only.

## G. Integrations status

`/api/integrations/status` reports (no secrets): Langfuse, Brave, Firecrawl, MCP Toolbox, Mac bridge, Steel, browser RPA, TokenRouter (tombstoned `tokenrouterAvailable: false`).

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

1. **Langfuse Cloud** account + Netlify `LANGFUSE_*`
2. **MCP Toolbox** container (Fly/Railway/VPS) + `MCP_TOOLBOX_URL`
3. **Mac bridge** (`storage:sync` + ngrok/Cloudflare tunnel) + `MAC_SYNC_*`
4. Optional: `BROWSER_USE_URL`, `STEEL_API_KEY`, `FIRECRAWL_API_KEY`, `BRAVE_API_KEY`
5. Redeploy Netlify → verify صحة التشغيل on the live site
