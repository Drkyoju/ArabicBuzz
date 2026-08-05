# MCP Toolbox deploy (Arabic Buzz)

Remote [googleapis/mcp-toolbox](https://github.com/googleapis/mcp-toolbox) with Streamable HTTP at `/mcp`.

When live, set Netlify:

```bash
npx netlify-cli env:set MCP_TOOLBOX_URL 'https://YOUR_HOST/mcp' \
  --force --context production --context deploy-preview --context branch-deploy
```

Arabic Buzz auto-connects via `lib/mcp/host-client.ts` when `MCP_TOOLBOX_URL` is set (catalog id `postgres`).

## Security

- Prefer a **SELECT-only** Postgres role (not the Supabase service / owner password).
- Prefer **direct** `db.<project>.supabase.co` over transaction poolers.
- Do not expose Toolbox publicly without network controls (Fly private networking, Railway auth, IP allowlist, or VPN).

## 1) Build `.env` from `DATABASE_URL`

```bash
cd deploy/toolbox
./scripts/env-from-database-url.sh
# or: DATABASE_URL='postgresql://…' ./scripts/env-from-database-url.sh
```

## 2) Local / VPS (Docker Compose)

```bash
docker compose up -d
# MCP endpoint: http://127.0.0.1:5000/mcp
```

Tunnel (ngrok / Cloudflare) if you need Netlify to reach a laptop/VPS, then set `MCP_TOOLBOX_URL`.

## 3) Fly.io

```bash
# once: curl -L https://fly.io/install.sh | sh && fly auth login
./scripts/deploy-fly.sh
# prints MCP_TOOLBOX_URL=https://arabicbuzz-mcp-toolbox.fly.dev/mcp
```

Requires `FLY_API_TOKEN` or interactive `fly auth login`.

## 4) Railway

```bash
npm i -g @railway/cli && railway login
./scripts/deploy-railway.sh
# Attach public domain → MCP_TOOLBOX_URL=https://<domain>/mcp
```

Requires `RAILWAY_TOKEN` or interactive login.

## Blocker (operator)

If neither Fly nor Railway is authenticated in this environment, leave `MCP_TOOLBOX_URL` unset until a host is deployed with one of the scripts above. Status UI: Integrations → MCP Toolbox.
