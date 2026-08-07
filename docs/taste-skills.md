# Taste & redesign skills (ArabicBuzz)

Skills guide the agent — they do **not** redesign alone. Ask for an explicit pass.

## Installed (use these)

| Install name | Path | Best for |
| --- | --- | --- |
| `design-taste-frontend` | `.cursor/skills/design-taste-frontend` | Landing / anti-slop craft ([Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)) |
| `redesign-existing-projects` | `.cursor/skills/redesign-existing-projects` | **Existing product UI** audits & polish |
| `arabicbuzz-taste` | `.cursor/skills/arabicbuzz-taste` | Forest green / RTL / shell constraints for this repo |

Already present: `web-design-guidelines` (Vercel), `accessibility`, `ux-writing-arabic`, `arabicbuzz-rtl-shell`, `arabicbuzz-live-qa`.

## How to invoke in Cursor

```
استخدم skill الـ redesign لإصلاح واجهة غرفة الفريق والفقاعات المقطوعة
```

```
use the redesign-existing-projects skill + arabicbuzz-taste to fix empty gutters and attach menus on https://arabicbuzz.netlify.app/
```

```
use the taste skill (design-taste-frontend) only for marketing pages — keep --ab-* tokens
```

## Visual QA

- Live only: https://arabicbuzz.netlify.app/
- Browser MCP / Playwright already configured in `.cursor/mcp.json` — no paid taste MCP added.
