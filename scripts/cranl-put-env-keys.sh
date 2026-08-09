#!/usr/bin/env bash
# Merge KEY=VALUE pairs into .env.cranl.local and PUT full env blob to CranL.
# Never prints secret values. Uses curl (Python SSL may fail on some Macs).
#
# Usage:
#   ./scripts/cranl-put-env-keys.sh MAC_SYNC_URL=https://… TELEGRAM_BOT_API_URL=https://…
#   ./scripts/cranl-put-env-keys.sh --restart MAC_SYNC_URL=https://…
#
# Requires: CRANL_API_KEY in .env.local or ~/.cranl/config.json

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ID="${CRANL_APP_ID:-bf8cff03-49ac-4a80-bb93-298305e6617e}"
API_BASE="${CRANL_API_BASE:-https://app.cranl.com/api}"
RESTART=0
PAIRS=()

for arg in "$@"; do
  if [[ "$arg" == "--restart" ]]; then
    RESTART=1
  elif [[ "$arg" == *=* ]]; then
    PAIRS+=("$arg")
  else
    echo "Unknown arg: $arg" >&2
    exit 2
  fi
done

if [[ ${#PAIRS[@]} -eq 0 ]]; then
  echo "Usage: $0 [--restart] KEY=VALUE …" >&2
  exit 2
fi

load_api_key() {
  if [[ -n "${CRANL_API_KEY:-}" ]]; then
    echo "$CRANL_API_KEY"
    return
  fi
  if [[ -f .env.local ]]; then
    local v
    v="$(grep -E '^CRANL_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
    if [[ -n "$v" ]]; then echo "$v"; return; fi
  fi
  if [[ -f "$HOME/.cranl/config.json" ]]; then
    python3 -c "import json; d=json.load(open('$HOME/.cranl/config.json')); print(d.get('api_key') or d.get('apiKey') or '')"
    return
  fi
  echo ""
}

API_KEY="$(load_api_key)"
if [[ -z "$API_KEY" ]]; then
  echo "CRANL_API_KEY missing" >&2
  exit 1
fi

# Ensure .env.cranl.local exists (prefer build from local if empty)
if [[ ! -f .env.cranl.local ]]; then
  if [[ -f .env.local ]]; then
    cp .env.local .env.cranl.local
  else
    echo "Missing .env.cranl.local" >&2
    exit 1
  fi
fi

python3 - "$ROOT" "${PAIRS[@]}" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
pairs = sys.argv[2:]
path = root / ".env.cranl.local"
lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
updates = {}
for p in pairs:
    k, _, v = p.partition("=")
    updates[k.strip()] = v

# Also mirror into .env.local for local ops (same keys only)
local_path = root / ".env.local"

def apply(path: Path, updates: dict) -> list[str]:
    changed = []
    if not path.exists():
        return changed
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    seen = set()
    out = []
    for ln in lines:
        if not ln.strip() or ln.lstrip().startswith("#") or "=" not in ln:
            out.append(ln)
            continue
        k, _, _ = ln.partition("=")
        k = k.strip()
        if k in updates:
            out.append(f"{k}={updates[k]}")
            seen.add(k)
            changed.append(k)
        else:
            out.append(ln)
    for k, v in updates.items():
        if k not in seen:
            out.append(f"{k}={v}")
            changed.append(k)
    path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    return changed

c1 = apply(path, updates)
c2 = apply(local_path, updates) if local_path.exists() else []
# Never print values — keys only
print("updated_cranl_local", ",".join(c1) or "(none)")
print("updated_env_local", ",".join(c2) or "(none)")
# Reject accidental star-masked push of critical keys
text = path.read_text()
bad = []
for ln in text.splitlines():
    if "=" not in ln or ln.lstrip().startswith("#"):
        continue
    k, _, v = ln.partition("=")
    if "*" in v and k.strip() in {
        "DATABASE_URL",
        "TELEGRAM_BOT_TOKEN",
        "MAC_SYNC_SECRET",
        "CRON_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
    }:
        bad.append(k.strip())
if bad:
    print("ABORT_MASKED", ",".join(bad))
    raise SystemExit(3)
PY

# Build JSON payload without printing secrets
python3 -c 'import json,pathlib; print(json.dumps({"env": pathlib.Path(".env.cranl.local").read_text()}))' \
  >/tmp/ab-cranl-env-put.json

HTTP=$(curl -sS -m 60 -o /tmp/ab-cranl-put-res.txt -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/ab-cranl-env-put.json \
  "$API_BASE/applications/$APP_ID/environment")
echo "put_http=$HTTP"
head -c 200 /tmp/ab-cranl-put-res.txt; echo

# Verify keys (values OK to show if URLs)
curl -sS -m 30 -H "Authorization: Bearer $API_KEY" \
  "$API_BASE/applications/$APP_ID/environment" -o /tmp/ab-cranl-env-verify.json
python3 - <<'PY'
import json
from pathlib import Path
d = json.loads(Path("/tmp/ab-cranl-env-verify.json").read_text())
vals = {}
for ln in d.get("env", "").splitlines():
    if "=" in ln:
        k, v = ln.split("=", 1)
        vals[k] = v
for k in ("MAC_SYNC_URL", "TELEGRAM_BOT_API_URL", "NEXT_PUBLIC_MAC_UPLOAD_URL"):
    v = vals.get(k, "MISSING")
    print(f"verify_{k}={v}")
PY

rm -f /tmp/ab-cranl-env-put.json

if [[ "$RESTART" -eq 1 ]]; then
  if command -v cranl >/dev/null 2>&1; then
    echo "Restarting CranL app for env reload…"
    cranl apps stop "$APP_ID" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -5 || true
    sleep 3
    cranl apps start "$APP_ID" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -5 || true
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
      code=$(curl -sS -o /dev/null -w '%{http_code}' -m 8 \
        "https://arabicbuzz-fooc9h.cranl.net/api/health/live" || echo 000)
      echo "live_probe_$i=$code"
      [[ "$code" == "200" ]] && break
      sleep 5
    done
  else
    echo "cranl CLI missing — env PUT done; restart from dashboard if hops still stale." >&2
  fi
fi

echo "✅ CranL env keys updated"
