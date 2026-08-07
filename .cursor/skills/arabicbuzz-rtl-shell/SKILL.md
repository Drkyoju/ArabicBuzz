---
name: arabicbuzz-rtl-shell
description: Preserve ArabicBuzz RTL sidebar/workspace shell layout. Use when editing sidebar, workspace-shell, or fixed aside layout.
---

# ArabicBuzz — RTL sidebar shell

Canonical: `components/sidebar.tsx` + `components/workspace-shell.tsx`.

## Layout contract

- Aside: `fixed inset-y-0 start-0 z-[60] w-[min(15.5rem,85vw)]`
- Main must offset at `md+`: `md:ms-[15.5rem]` (same width)
- Never ship a fixed sidebar without that offset

## Mobile vs desktop

- Mobile: drawer closed by default; backdrop only while open
- Desktop (`md+`): sidebar always visible and clickable — not incorrectly `inert` / `aria-hidden`
- Use `drawerActive = mobileOpen || isDesktop` so `inert` applies only when the mobile drawer is closed

## QA

Verify on https://arabicbuzz.netlify.app/ at ~375px and ~1280px.
