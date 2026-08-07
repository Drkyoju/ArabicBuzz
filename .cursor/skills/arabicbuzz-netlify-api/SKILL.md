---
name: arabicbuzz-netlify-api
description: Netlify App Router API constraints for ArabicBuzz. Use when creating or editing app/api route handlers.
---

# ArabicBuzz — Netlify API routes

Every `app/api/**/route.ts` must export:

```ts
export const dynamic = 'force-dynamic'
```

## Secrets

- Never hardcode API keys, tokens, or webhook secrets
- Read secrets only from `process.env`
- Prefer `NEXT_PUBLIC_*` only for non-secret client values

## MCP note

Stdio MCP servers cannot run inside Netlify functions. Use remote SSE/HTTP (`MCP_*_URL`, `MCP_REMOTE_SERVERS`) or the Mac ops bridge (`packages/ops-bridge`).
