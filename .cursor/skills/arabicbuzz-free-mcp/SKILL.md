---
name: arabicbuzz-free-mcp
description: Prefer free no-key ArabicBuzz builtins and wired MCPs (DDG, fetch/Jina, Drive native, pdf-lib) over paid Firecrawl/Brave. Use for Telegram capability gaps, research_task_tools, Hermes/Cursor MCP setup.
---

# ArabicBuzz — free MCP & skills path

## Product (CranL) — always first

| Need | Free builtin | Avoid unless optional key |
|------|--------------|---------------------------|
| Web search | `web_search` (DuckDuckGo + Wikipedia + `site:gov.sa`) | Firecrawl, paid Brave |
| Page text | `web_fetch` / `ingest_url_to_brain` (Jina Reader) | Paid crawlers |
| PDF ops | `pdf_*` via pdf-lib | Remote PDF MCP |
| Drive / Gmail | Native OAuth tools | Separate Workspace MCP |
| Telegram | grammy bot + `return_file` | Telegram userbot MCP |
| Capability gap | `research_task_tools` → `executeNext` free map | Blind clone of random GitHub MCP |

Docs: `docs/skills-and-mcp.md`, `lib/agents/tools/free-execute-map.ts`, `lib/mcp/catalog.ts`.

## Cursor (local) — `.cursor/mcp.json`

Already wired no-key: filesystem, memory, sequential-thinking, git, fetch, time, playwright, context7, markitdown, duckduckgo, chrome-devtools.

Optional keys: `GITHUB_PERSONAL_ACCESS_TOKEN`, `BRAVE_API_KEY`, IMAP_*, Supabase OAuth, Linear OAuth.

Stubs (copy when needed): `.cursor/mcp.stubs.example.json` — Google Workspace, Telegram userbot, Notion, github-official Docker.

## Hermes (`~/.hermes`) — do not commit secrets

Free MCP in `config.yaml` `mcp_servers`: filesystem, memory, sequential-thinking, duckduckgo, context7, time, git, markitdown, github (PAT via `.env` only).

Free skill: `research/duckduckgo-search` (`hermes skills install official/research/duckduckgo-search -y`) — fallback when Firecrawl key missing.

Monterey note: prefer **npx** MCP packages; `uvx` Python MCP wrappers need `~/.hermes/bin/realpath` shim.

## Agent rule

Never ask the user for a paid key until free builtins + DDG/Jina/Drive native paths are exhausted. Never run untrusted remote MCP code from research hits — map to builtins via `mapSuggestionsToBuiltinFreeTools`.
