# Free / cheap stack only

Arabic Buzz is wired for **free tiers + open GitHub** — no paid SaaS required.

## What you need (all free)

| Piece | Free option | Action |
|-------|-------------|--------|
| Hosting | Netlify free | already live |
| Auth + DB | Supabase free | keep current project |
| DB from Netlify | Supabase **Transaction pooler** `:6543` | set `DATABASE_URL` to pooler URI (still free tier) |
| Embeddings | Hugging Face free token | set `HF_TOKEN` (no paid plan) |
| Or self-host embeds | [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) BGE-M3 | set `BGE_M3_BASE_URL` |
| Search web | DuckDuckGo / Wikipedia / gov.sa | built-in, no key |
| URL → brain | Jina Reader free path | built-in |
| Telegram | BotFather free | `TELEGRAM_BOT_TOKEN` |
| Models | Gemini / OpenRouter free tiers if you already have keys | optional |
| STT | HF Arabic models via `HF_TOKEN` | already supported |

**Do not set** unless you later choose to pay: `COHERE_API_KEY`, Firecrawl, Brave, Langfuse paid, Steel paid.

Leave `EMBEDDING_PROVIDER` empty. Cascade: **HF → BGE → hash**.

## Open GitHub / Hub (free)

- Embeddings self-host: https://github.com/FlagOpen/FlagEmbedding  
- Arabic-capable e5: https://huggingface.co/intfloat/multilingual-e5-large  
- Multiplayer ideas (not required): https://github.com/yc-software/qm  
- Agent rooms ideas: https://github.com/block/buzz  

## One-time Netlify env (free)

```
HF_TOKEN=hf_...          # free Hugging Face access token
DATABASE_URL=...         # Supabase pooler :6543 (free tier)
# EMBEDDING_PROVIDER=    # leave unset
# no COHERE_API_KEY
```

Then sync Drive brain once and use «اسأل ملفات الفريق».
