# Free / open stack (Gulf multiplayer agents)

Arabic Buzz prefers **free defaults** and paid upgrades only when needed.

## Embeddings (knowledge brain)

| Priority | Provider | Cost | How |
|----------|----------|------|-----|
| 1 | Cohere multilingual | Paid | `COHERE_API_KEY` |
| 2 | BGE-M3 self-host | Free | [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) → set `BGE_M3_BASE_URL` |
| 3 | Hugging Face e5 | Free tier | `HF_TOKEN` + `intfloat/multilingual-e5-large` |
| 4 | Hash fallback | Free | Always works (weaker recall) |

Leave `EMBEDDING_PROVIDER` empty — the server picks the best available.

## Rerank

Local Arabic lexical re-rank (no API) runs after hybrid/Supabase search.

## Database on Netlify

Use Supabase **Transaction pooler** (`:6543` / `pooler.supabase.com`) as `DATABASE_URL`.  
`lib/db-url.ts` adds `pgbouncer=true` + `connection_limit=1`.

## Related open projects (ideas, not vendored)

- [yc-software/qm](https://github.com/yc-software/qm) — multiplayer scopes / crons
- [block/buzz](https://github.com/block/buzz) — human+agent rooms
- [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) — BGE-M3
- [intfloat/multilingual-e5-large](https://huggingface.co/intfloat/multilingual-e5-large) — free Arabic-capable embeds
