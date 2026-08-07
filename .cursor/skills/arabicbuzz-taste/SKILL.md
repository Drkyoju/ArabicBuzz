---
name: arabicbuzz-taste
description: ArabicBuzz product UI taste — forest green --ab-* tokens, RTL MSA, sidebar shell. Use with design-taste-frontend / redesign-existing-projects when redesigning ArabicBuzz UX (not greenfield landing pages).
---

# ArabicBuzz Taste Bridge

Use this **together with** `design-taste-frontend` (marketing/landing) or preferably `redesign-existing-projects` (existing app UI).

## Honest limit

Skills guide the agent. They do **not** magically redesign the site. Ask for an explicit redesign/UX pass every time.

## Invoke in Cursor

- «استخدم skill الـ taste / redesign لإصلاح واجهة غرفة الفريق»
- «use the redesign-existing-projects skill to fix empty gutters and clipped popovers on ArabicBuzz»
- «use arabicbuzz-taste + web-design-guidelines to audit the room composer»

## Product constraints (do not break)

1. **Stack:** Next.js App Router, Tailwind, forest green `--ab-*` tokens in `app/globals.css`.
2. **Language:** UI copy = Modern Standard Arabic. `lang="ar"` `dir="rtl"`. Code/JSON/URLs: `dir="ltr"`.
3. **Shell:** Fixed sidebar + `md:ms-[var(--ab-sidebar-width)]` — see `arabicbuzz-rtl-shell`.
4. **Verify only on** https://arabicbuzz-fooc9h.cranl.net/ (never localhost).
5. Prefer existing components (`ab-btn-*`, `ab-section`, `ab-empty`, `coordsForAnchoredFloating`) over new purple/cream AI aesthetics.

## Redesign dials (product UI)

For room / dashboard / settings (not landing):

- `DESIGN_VARIANCE`: 3–4 (keep shell; refine density/hierarchy)
- `MOTION_INTENSITY`: 2–3 (hover/focus only)
- `VISUAL_DENSITY`: 6–7 (ops cockpit; avoid hollow empty cards)

## Companion skills already in-repo

| Skill | When |
| --- | --- |
| `redesign-existing-projects` | Audit + fix live product UI |
| `design-taste-frontend` | Landing / marketing surfaces only |
| `web-design-guidelines` | Vercel Web Interface Guidelines audit |
| `accessibility` | WCAG / a11y pass |
| `ux-writing-arabic` | Arabic microcopy |
| `arabicbuzz-live-qa` | Post-deploy live smoke |
| `arabicbuzz-rtl-shell` | Sidebar / RTL layout |
