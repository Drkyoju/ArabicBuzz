# Free / cheap stack only

Arabic Buzz is wired for **free tiers + open GitHub** — no paid SaaS required.

## What you need (all free)

| Piece | Free option | Action |
|-------|-------------|--------|
| Hosting | Netlify free | already live |
| Auth + DB | Supabase free | keep current project |
| DB from Netlify | Supabase **Transaction pooler** `:6543` | set `DATABASE_URL` to pooler URI (or keep direct — app rewrites with `SUPABASE_POOLER_REGION`) |
| Embeddings (default) | **Gemini** `gemini-embedding-001` @ 1024-d | already uses `GEMINI_API_KEY` |
| Embeddings (alt) | Hugging Face free token | set `HF_TOKEN` (preferred if set) |
| Or self-host embeds | [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) BGE-M3 | set `BGE_M3_BASE_URL` |
| Search web | DuckDuckGo / Wikipedia / gov.sa | built-in, no key |
| URL → brain | Jina Reader free path | built-in |
| Telegram | BotFather free | `TELEGRAM_BOT_TOKEN` |
| Models | Gemini / OpenRouter free tiers if you already have keys | optional |
| STT (mic) | **Gemini audio** (same key) + optional [Willow WIS](https://github.com/toverainc/willow-inference-server) / Groq / HF Arabic | already works with `GEMINI_API_KEY` |

**Do not set** unless you later choose to pay: `COHERE_API_KEY`, Firecrawl, Brave, Langfuse paid, Steel paid.

Leave `EMBEDDING_PROVIDER` empty. Cascade: **HF → Gemini → BGE → hash**.

Mic STT cascade: **Willow (if URL) → Gemini → HF Arabic → Groq Whisper**.

## Health check

`GET /api/health/free` → `embeddingProvider`, `dbPooler`, `supabaseOk`, `brainDocuments`, `prismaOk`.

## Open GitHub / Hub (free)

- Embeddings self-host: https://github.com/FlagOpen/FlagEmbedding  
- Arabic-capable e5: https://huggingface.co/intfloat/multilingual-e5-large  
- Willow Inference Server (self-host Whisper): https://github.com/toverainc/willow-inference-server  
- Multiplayer ideas (not required): https://github.com/yc-software/qm  
- Agent rooms ideas: https://github.com/block/buzz  

## One-time Netlify env (free)

```
DATABASE_URL=...              # Supabase pooler :6543 (recommended)
SUPABASE_POOLER_REGION=eu-central-1   # auto-rewrite if direct URL left
GEMINI_API_KEY=...            # chat + embeds + mic STT
# HF_TOKEN=hf_...             # optional Arabic HF STT / e5
# GROQ_API_KEY=...            # optional free Whisper large-v3
# WILLOW_STT_URL=https://host:19000/api/willow   # optional self-host
# EMBEDDING_PROVIDER=         # leave unset
# no COHERE_API_KEY
```

Then sync Drive brain once and use «اسأل ملفات الفريق».
