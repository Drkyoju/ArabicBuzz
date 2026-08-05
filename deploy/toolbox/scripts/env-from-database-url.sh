#!/usr/bin/env bash
# Parse DATABASE_URL (or first arg) into deploy/toolbox/.env for MCP Toolbox.
# Prefer a direct (non-pooler) host when possible; Supabase session pooler is OK
# for short queries, but transaction poolers can break prepared statements.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/.env"
URL="${1:-${DATABASE_URL:-}}"

if [[ -z "${URL}" ]]; then
  # Load from repo .env.local without printing secrets
  LOCAL_ENV="$(cd "${ROOT}/../.." && pwd)/.env.local"
  if [[ -f "${LOCAL_ENV}" ]]; then
    # shellcheck disable=SC1090
    set -a
    # Only pull DATABASE_URL
    eval "$(grep -E '^DATABASE_URL=' "${LOCAL_ENV}" | sed 's/^/export /')"
    set +a
    URL="${DATABASE_URL:-}"
  fi
fi

if [[ -z "${URL}" ]]; then
  echo "Usage: DATABASE_URL=postgresql://… $0" >&2
  echo "   or: $0 'postgresql://user:pass@host:5432/db?sslmode=require'" >&2
  exit 1
fi

python3 - "$URL" "$OUT" <<'PY'
import sys, urllib.parse
from pathlib import Path

url, out = sys.argv[1], Path(sys.argv[2])
p = urllib.parse.urlparse(url)
if p.scheme not in ("postgres", "postgresql"):
    sys.exit(f"Unsupported scheme: {p.scheme}")
host = p.hostname or ""
port = p.port or 5432
db = (p.path or "/").lstrip("/").split("?")[0] or "postgres"
user = urllib.parse.unquote(p.username or "")
password = urllib.parse.unquote(p.password or "")
q = urllib.parse.parse_qs(p.query)
ssl = q.get("sslmode", ["require"])[0]
params = f"sslmode={ssl}"
# Warn (no secret) if pooler
note = ""
if "pooler" in host:
    note = "# NOTE: host looks like a pooler — prefer direct db.*.supabase.co for Toolbox\n"
text = (
    f"{note}"
    f"POSTGRES_HOST={host}\n"
    f"POSTGRES_PORT={port}\n"
    f"POSTGRES_DATABASE={db}\n"
    f"POSTGRES_USER={user}\n"
    f"POSTGRES_PASSWORD={password}\n"
    f"POSTGRES_QUERY_PARAMS={params}\n"
    f"TOOLBOX_PORT=5000\n"
)
out.write_text(text)
print(f"Wrote {out} (POSTGRES_HOST={host} port={port} db={db})")
if "pooler" in host:
    print("Warning: pooler hostname detected — use direct connection if tools fail.")
PY
