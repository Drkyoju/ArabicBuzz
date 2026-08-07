---
name: arabicbuzz-testing
description: >-
  Run ArabicBuzz unit (Vitest), live CranL Playwright smoke, and offline evals.
  Never use localhost for product QA — only https://arabicbuzz-fooc9h.cranl.net/
---

# ArabicBuzz testing

## Commands

```bash
npm run test:unit
npm run test:live-smoke
npm run test:e2e:smoke   # يحتاج Chromium (غير مدعوم على macOS 12 Monterey)
npm run test:evals -- --offline
npm run test:promptfoo
```

## Live QA rules

- Base URL: `https://arabicbuzz-fooc9h.cranl.net/`
- App id: `bf8cff03-49ac-4a80-bb93-298305e6617e`
- Critical API checks: `/api/public-config`, `/api/health/free`, `/api/webhooks/telegram`
- Playwright config already defaults to CranL (`playwright.config.ts`)

## What to cover first

1. Telegram intents: `tests/unit/telegram-intents.test.ts`
2. Auth public-config + health smoke: `tests/e2e/live-smoke.spec.ts`
3. Agent Arabic/safety gates: `npm run test:evals -- --offline`
4. Prompt/copy structural gates: `npm run test:promptfoo`

## Skills

- Project skill: this file
- Playwright patterns (optional cache): `npx skills add testdino-hq/playwright-skill/core -y`
- Live QA: `.cursor/skills/arabicbuzz-live-qa`
