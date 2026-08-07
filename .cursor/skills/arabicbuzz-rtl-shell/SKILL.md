---
name: arabicbuzz-rtl-shell
description: Preserve ArabicBuzz RTL sidebar/workspace shell layout. Use when editing sidebar, workspace-shell, or fixed aside layout.
---

# ArabicBuzz — RTL sidebar shell

Canonical: `components/sidebar.tsx` + `components/workspace-shell.tsx`.

## Layout contract

- Aside: `fixed inset-y-0 start-0 z-[60] w-[min(var(--ab-sidebar-width),85vw)]`
- Main must offset at `md+`: `md:ms-[var(--ab-sidebar-width)]` (same CSS variable)
- `--ab-sidebar-width` defaults to `15.5rem`; desktop resize handle updates it (12–22rem, localStorage)
- Never ship a fixed sidebar without that matching offset

## Mobile vs desktop

- Mobile: drawer closed by default; backdrop only while open
- Desktop (`md+`): sidebar always visible and clickable — not incorrectly `inert` / `aria-hidden`
- Use `drawerActive = mobileOpen || isDesktop` so `inert` applies only when the mobile drawer is closed
- Resize handle is desktop-only on the inline-end edge

## QA

Verify on https://arabicbuzz.netlify.app/ at ~375px and ~1280px.
