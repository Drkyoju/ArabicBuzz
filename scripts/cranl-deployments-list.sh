#!/usr/bin/env bash
# List CranL deployments via API (workaround for CLI v1.7.0 bug).
#
# Bug: `cranl apps deployments list <id>` crashes with:
#   Error: deployments.map is not a function
# Cause: API returns `{ deployments: [...] }` (camelCase fields), but the CLI
# treats the body as a bare array with snake_case fields.
#
# Usage:
#   ./scripts/cranl-deployments-list.sh
#   ./scripts/cranl-deployments-list.sh <app-id>
#   ./scripts/cranl-deployments-list.sh --limit 5
#   ./scripts/cranl-deployments-list.sh --json
#   npm run cranl:deployments
#
# Requires: CRANL_API_KEY in env, .env.local, or ~/.cranl/config.json
# Never prints the API key or env secrets.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ID="${CRANL_APP_ID:-bf8cff03-49ac-4a80-bb93-298305e6617e}"
API_BASE="${CRANL_API_BASE:-https://app.cranl.com/api}"
LIMIT=20
AS_JSON=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) AS_JSON=1; shift ;;
    --limit)
      LIMIT="${2:-20}"
      shift 2
      ;;
    --limit=*)
      LIMIT="${1#*=}"
      shift
      ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
    *)
      APP_ID="$1"
      shift
      ;;
  esac
done

load_api_key() {
  if [[ -n "${CRANL_API_KEY:-}" ]]; then
    printf '%s' "$CRANL_API_KEY"
    return
  fi
  if [[ -f .env.local ]]; then
    local v
    v="$(grep -E '^CRANL_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
    if [[ -n "$v" ]]; then printf '%s' "$v"; return; fi
  fi
  if [[ -f "$HOME/.cranl/config.json" ]]; then
    /usr/bin/python3 -c "import json; d=json.load(open('$HOME/.cranl/config.json')); print(d.get('api_key') or d.get('apiKey') or '', end='')"
    return
  fi
  printf ''
}

API_KEY="$(load_api_key)"
if [[ -z "$API_KEY" ]]; then
  echo "CRANL_API_KEY missing (env, .env.local, or ~/.cranl/config.json)" >&2
  exit 1
fi

TMP="$(mktemp -t ab-cranl-deps.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

HTTP="$(
  /usr/bin/curl -sS -m 45 -o "$TMP" -w '%{http_code}' \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Accept: application/json" \
    "${API_BASE}/applications/${APP_ID}/deployments" || echo "000"
)"
unset API_KEY

if [[ "$HTTP" != "200" ]]; then
  echo "CranL deployments API HTTP ${HTTP} for app ${APP_ID}" >&2
  /usr/bin/python3 -c "from pathlib import Path; t=Path('$TMP').read_text(errors='replace')[:200]; print(t.replace(chr(10),' '))" >&2 || true
  exit 1
fi

LIMIT="$LIMIT" AS_JSON="$AS_JSON" APP_ID="$APP_ID" /usr/bin/python3 - "$TMP" <<'PY'
import json, os, re, sys
from pathlib import Path

path = Path(sys.argv[1])
raw = path.read_text(encoding="utf-8", errors="replace")
data = json.loads(raw)
deps = data.get("deployments") if isinstance(data, dict) else data
if not isinstance(deps, list):
    print("Unexpected response shape (expected {deployments: [...]})", file=sys.stderr)
    if isinstance(data, dict):
        print("keys:", sorted(data.keys())[:20], file=sys.stderr)
    sys.exit(1)

limit = max(1, int(os.environ.get("LIMIT") or "20"))
as_json = os.environ.get("AS_JSON") == "1"
app_id = os.environ.get("APP_ID", "")

sha_re = re.compile(r"(?i)commit:\s*([0-9a-f]{7,40})")

def norm(d: dict) -> dict:
    desc = d.get("description") or ""
    m = sha_re.search(str(desc))
    sha = (m.group(1) if m else "")[:12] or "-"
    title = (d.get("title") or "-").replace("\n", " ").strip()
    if len(title) > 56:
        title = title[:53] + "…"
    return {
        "id": d.get("deploymentId") or d.get("id") or "-",
        "status": d.get("status") or "-",
        "commit": sha,
        "message": title,
        "created_at": d.get("createdAt") or d.get("created_at") or "-",
        "started_at": d.get("startedAt") or "-",
        "finished_at": d.get("finishedAt") or "-",
    }

rows = [norm(d) for d in deps if isinstance(d, dict)]
# API usually newest-first; keep that order
rows = rows[:limit]

if as_json:
    print(json.dumps({"appId": app_id, "count": len(rows), "deployments": rows}, ensure_ascii=False, indent=2))
    raise SystemExit(0)

print(f"CranL deployments — app {app_id} (showing {len(rows)})")
print(f"{'STATUS':<10} {'COMMIT':<12} {'CREATED':<22} {'ID':<24} MESSAGE")
print("-" * 100)
for r in rows:
    created = str(r["created_at"])[:19].replace("T", " ")
    print(f"{r['status']:<10} {r['commit']:<12} {created:<22} {str(r['id']):<24} {r['message']}")
PY
