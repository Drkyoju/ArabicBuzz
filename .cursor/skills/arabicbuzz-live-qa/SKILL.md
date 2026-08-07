---
name: arabicbuzz-live-qa
description: Verify ArabicBuzz only on the live Netlify site. Use when QA, smoke tests, browser checks, or "does it work?" after deploy.
---

# ArabicBuzz — Live site only

## Rule

- The only verification URL is **https://arabicbuzz.netlify.app/**
- Never use localhost, `127.0.0.1`, `next dev`, or local preview for QA.
- After code changes: commit → push to `main` → wait for Netlify → verify live.

## Checklist

1. Confirm deploy finished on Netlify.
2. Hard-refresh the live URL.
3. Check ~375px (drawer closed) and ~1280px (sidebar + content both readable).
4. Do not start a local server “just to check the UI”.
