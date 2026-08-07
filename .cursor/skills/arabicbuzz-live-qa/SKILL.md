---
name: arabicbuzz-live-qa
description: Verify ArabicBuzz only on the live CranL site. Use when QA, smoke tests, browser checks, or "does it work?" after deploy.
---

# ArabicBuzz — Live site only

## Rule

- The only verification URL is **https://arabicbuzz-fooc9h.cranl.net/**
- Never use localhost, `127.0.0.1`, `next dev`, or local preview for QA.
- After code changes: commit → push to `main` → wait for CranL → verify live.
- Netlify is fallback only; prefer CranL for all post-cutover checks.

## Checklist

1. Confirm deploy finished on CranL (`cranl apps deployments list <app-id>`).
2. Hard-refresh the live URL.
3. Check ~375px (drawer closed) and ~1280px (sidebar + content both readable).
4. Smoke: `GET /api/health/free` and `GET /api/webhooks/telegram`.
5. Do not start a local server “just to check the UI”.
