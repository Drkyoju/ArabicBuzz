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
| Wikipedia article | `wikipedia_lookup` | Paid search |
| YouTube captions | `youtube_transcript` | Paid STT APIs |
| Math | `math_eval` | — |
| Domain DNS/RDAP | `domain_intel` | Paid WHOIS APIs |
| Academic papers | `arxiv_search` | Paid research APIs |
| FX rates (incl. SAR) | `fx_rate` | Paid FX APIs |
| Geocode | `geocode` (Nominatim) | Paid maps APIs |
| English dictionary | `dictionary_lookup` | — |
| Hacker News | `hn_search` | — |
| Riyadh + Hijri datetime | `saudi_datetime` | Paid calendar APIs |
| Wayback snapshot | `wayback_lookup` | Paid archive APIs |
| PDF ops | `pdf_*` via pdf-lib | Remote PDF MCP |
| Drive / Gmail | Native OAuth tools | Separate Workspace MCP |
| Telegram | grammy bot + `return_file` | Telegram userbot MCP |
| Capability gap | `research_task_tools` → `executeNext` free map | Blind clone of random GitHub MCP |

Docs: `docs/skills-and-mcp.md`, `lib/agents/tools/free-execute-map.ts`, `lib/mcp/catalog.ts`.

## Cursor (local) — `.cursor/mcp.json`

Already wired no-key: filesystem, memory, sequential-thinking, git, fetch, time, playwright, context7, markitdown, duckduckgo, wikipedia, math, youtube-transcript, dns, arxiv, public-apis, chrome-devtools.

Optional keys: `GITHUB_PERSONAL_ACCESS_TOKEN`, `BRAVE_API_KEY`, IMAP_*, Supabase OAuth, Linear OAuth.

Stubs (copy when needed): `.cursor/mcp.stubs.example.json` — Google Workspace, Telegram userbot, Notion, github-official Docker.

## Hermes (`~/.hermes`) — do not commit secrets

Free MCP in `config.yaml` `mcp_servers`: filesystem, memory, sequential-thinking, duckduckgo, context7, time, fetch (`@tokenizin/mcp-npx-fetch`), wikipedia (`@shelm/wikipedia-mcp-server`), math (`math-mcp`), youtube-transcript (`@sinco-lab/mcp-youtube-transcript`), dns (`mcp-server-dns`), arxiv (`@fre4x/arxiv`), public-apis (`mcp-public-apis`). github only when PAT in `.env`. git/markitdown stay disabled on Monterey.

Free skill: `research/duckduckgo-search` (`hermes skills install official/research/duckduckgo-search -y`) — fallback when Firecrawl key missing. Also useful: `domain-intel`, `arxiv`, `code-wiki`, `scrapling`, `maps`, `xlsx`.

Local WA/Drive skills: `wa-archive`, `wa-file-read`, `wa-storage-mesh`, `wa-pdf-dup`, `waqf-drive`, `ar-help`, `wa-tools` + scripts `hermes-wa-drive-archive.sh`, `hermes-file-read.sh`, `hermes-storage-mesh.sh`, `hermes-pdf-dup.sh`, `hermes-jina-fetch.sh`, `hermes-tools-status.sh`.

Parity checklist: `lib/agents/free-toolkit.ts` — **same excellent free set, separate runtimes** (no WA↔TG coupling).

Product (CranL / `@alhuda14bot`) — **independent** free builtins (not wired to Hermes): `wikipedia_lookup`, `youtube_transcript`, `math_eval`, `domain_intel`, `arxiv_search`, `fx_rate`, `geocode`, `dictionary_lookup`, `hn_search`, `saudi_datetime`, `wayback_lookup` + `find_storage_mesh` / `pdf_duplicate_page` / Drive / OCR.

Monterey note: prefer **npx** MCP packages; `uvx` Python MCP wrappers need `~/.hermes/bin/realpath` shim. PDF/OCR via `~/.hermes/docs-venv` (pymupdf/pypdf/pillow/pytesseract) — not marker-pdf (~5GB) / pdfplumber / pypdfium2. Skip `youtube-transcript-mcp` (needs bun) and broken `mcp-server-wikipedia`.

## Agent rule

Never ask the user for a paid key until free builtins + DDG/Jina/Drive native paths are exhausted. Never run untrusted remote MCP code from research hits — map to builtins via `mapSuggestionsToBuiltinFreeTools`.
