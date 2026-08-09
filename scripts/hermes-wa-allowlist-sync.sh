#!/usr/bin/env bash
# Merge WhatsApp @g.us JIDs into Hermes allowlist (~/.hermes/.env + config.yaml).
#
# Usage:
#   ./scripts/hermes-wa-allowlist-sync.sh                 # scan participating groups via Baileys
#   ./scripts/hermes-wa-allowlist-sync.sh --add JID[@g.us] # add one JID (no scan)
#   ./scripts/hermes-wa-allowlist-sync.sh --from-logs      # scrape bridge/gateway logs only
#   ./scripts/hermes-wa-allowlist-sync.sh --dry-run
#
# After changes: hermes gateway restart (unless --no-restart).

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ENV_FILE="$HERMES_HOME/.env"
CFG_FILE="$HERMES_HOME/config.yaml"
BRIDGE_LOG="$HERMES_HOME/platforms/whatsapp/bridge.log"
GATEWAY_LOG="$HERMES_HOME/logs/gateway.log"
SESSION_DIR="${WHATSAPP_SESSION_DIR:-$HERMES_HOME/platforms/whatsapp/session}"
BRIDGE_NM="$HERMES_HOME/hermes-agent/scripts/whatsapp-bridge/node_modules"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

DRY=0
NO_RESTART=0
FROM_LOGS=0
SCAN=1
ADD_JIDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-restart) NO_RESTART=1 ;;
    --from-logs) FROM_LOGS=1; SCAN=0 ;;
    --no-scan) SCAN=0 ;;
    --add)
      shift
      [[ $# -gt 0 ]] || { echo "--add needs a JID" >&2; exit 2; }
      ADD_JIDS+=("$1")
      SCAN=0
      ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
  shift
done

normalize_jid() {
  local j="$1"
  j="${j%%[[:space:]]*}"
  j="${j//@s.whatsapp.net/}"
  if [[ "$j" != *@g.us ]]; then
    j="${j%@g.us}@g.us"
    [[ "$j" == *@g.us ]] || j="${j}@g.us"
  fi
  # strip accidental double
  j="${j//@g.us@g.us/@g.us}"
  echo "$j"
}

collect_from_logs() {
  local files=()
  [[ -f "$BRIDGE_LOG" ]] && files+=("$BRIDGE_LOG")
  [[ -f "$GATEWAY_LOG" ]] && files+=("$GATEWAY_LOG")
  if [[ ${#files[@]} -eq 0 ]]; then
    return 0
  fi
  rg -oN '[0-9]+@g\.us' "${files[@]}" 2>/dev/null | sort -u || true
}

scan_participating() {
  # Uses a short-lived Baileys sock — requires bridge stopped OR uses /chat after
  # listing JIDs from logs. Prefer log scrape + optional offline scan.
  node --input-type=module <<'NODE'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'
import { spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR || path.join(HERMES_HOME, 'platforms', 'whatsapp', 'session')
const BRIDGE_NM = path.join(HERMES_HOME, 'hermes-agent', 'scripts', 'whatsapp-bridge', 'node_modules')
const require = createRequire(path.join(BRIDGE_NM, 'package.json'))
const hermes = process.env.HERMES_BIN || path.join(os.homedir(), '.local', 'bin', 'hermes')

function portInUse(port = 3000) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  return r.status === 0 && Boolean(r.stdout?.trim())
}

async function waitPortFree(ms = 45000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (!portInUse()) return
    await sleep(400)
  }
  throw new Error('port 3000 still busy')
}

let stopped = false
if (portInUse()) {
  spawnSync(hermes, ['gateway', 'stop'], { encoding: 'utf8', env: { ...process.env, PATH: `${path.dirname(hermes)}:${process.env.PATH || ''}` } })
  stopped = true
  await waitPortFree()
}

const baileys = await import(path.join(BRIDGE_NM, '@whiskeysockets/baileys/lib/index.js'))
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys
const pino = (await import(path.join(BRIDGE_NM, 'pino/pino.js'))).default
const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
const { version } = await fetchLatestBaileysVersion()

const jids = await new Promise((resolve, reject) => {
  let done = false
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u) => {
    if (u.connection !== 'open' || done) return
    try {
      const groups = await sock.groupFetchAllParticipating()
      const ids = Object.keys(groups || {}).filter((j) => j.endsWith('@g.us'))
      done = true
      try { sock.end(undefined) } catch {}
      resolve(ids)
    } catch (e) {
      done = true
      try { sock.end(undefined) } catch {}
      reject(e)
    }
  })
  setTimeout(() => {
    if (!done) {
      done = true
      try { sock.end(undefined) } catch {}
      reject(new Error('scan timeout'))
    }
  }, 60000)
})

for (const j of jids) console.log(j)

if (stopped) {
  spawnSync(hermes, ['gateway', 'restart'], { encoding: 'utf8', env: { ...process.env, PATH: `${path.dirname(hermes)}:${process.env.PATH || ''}` } })
}
NODE
}

current_env_jids() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  local line
  line="$(grep -E '^WHATSAPP_GROUP_ALLOWED_USERS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  echo "$line" | tr ',' '\n' | sed '/^$/d'
}

merge_unique() {
  local -a all=("$@")
  printf '%s\n' "${all[@]}" | sed '/^$/d' | while read -r j; do normalize_jid "$j"; done | sort -u
}

write_env() {
  local joined="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE" >&2
    exit 1
  fi
  if grep -qE '^WHATSAPP_GROUP_ALLOWED_USERS=' "$ENV_FILE"; then
    # portable in-place: use temp
    local tmp
    tmp="$(mktemp)"
    awk -v v="$joined" '
      BEGIN { done=0 }
      /^WHATSAPP_GROUP_ALLOWED_USERS=/ {
        print "WHATSAPP_GROUP_ALLOWED_USERS=" v
        done=1
        next
      }
      { print }
      END {
        if (!done) print "WHATSAPP_GROUP_ALLOWED_USERS=" v
      }
    ' "$ENV_FILE" >"$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '\nWHATSAPP_GROUP_ALLOWED_USERS=%s\n' "$joined" >>"$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi
}

write_yaml() {
  local joined="$1"
  python3 - "$CFG_FILE" "$joined" <<'PY'
import sys, re
from pathlib import Path
path, joined = Path(sys.argv[1]), sys.argv[2]
jids = [j.strip() for j in joined.split(",") if j.strip()]
text = path.read_text(encoding="utf-8")
block_lines = "\n".join(f'        - "{j}"' for j in jids) + "\n"
# Update platforms.whatsapp.extra.group_allow_from if present
pat_extra = re.compile(
    r"(?m)^(\s*group_allow_from:\n)(?:^\s+- .*\n)*",
)
# Prefer replacing every group_allow_from list (top-level whatsapp + platforms.extra)
def repl(m):
    indent = m.group(1)
    # Detect indent of list items from the key line
    key_indent = len(indent) - len(indent.lstrip(" "))
    item_indent = " " * (key_indent + 2)
    items = "".join(f'{item_indent}- "{j}"\n' for j in jids)
    return indent + items

text2, n = pat_extra.subn(repl, text)
if n == 0:
    # insert under platforms.whatsapp.extra
    if "platforms:\n" in text2 and "whatsapp:\n" in text2:
        text2 = re.sub(
            r"(?m)^(  whatsapp:\n    extra:\n)",
            r"\1      group_allow_from:\n" + "".join(f'        - "{j}"\n' for j in jids),
            text2,
            count=1,
        )
    else:
        text2 = text.rstrip() + "\nwhatsapp:\n  group_allow_from:\n" + "".join(f'    - "{j}"\n' for j in jids)
path.write_text(text2, encoding="utf-8")
print(f"Updated {path} ({n} group_allow_from block(s))")
PY
}

FOUND=()
while IFS= read -r line; do
  [[ -n "$line" ]] && FOUND+=("$line")
done < <(current_env_jids)

for j in "${ADD_JIDS[@]}"; do
  FOUND+=("$(normalize_jid "$j")")
done

if [[ "$FROM_LOGS" -eq 1 ]] || [[ "$SCAN" -eq 0 && ${#ADD_JIDS[@]} -eq 0 ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && FOUND+=("$line")
  done < <(collect_from_logs)
fi

if [[ "$SCAN" -eq 1 ]]; then
  echo "Scanning participating WhatsApp groups (brief gateway stop)…" >&2
  while IFS= read -r line; do
    [[ -n "$line" ]] && FOUND+=("$line")
  done < <(scan_participating)
  # scan_participating already restarts gateway — avoid double restart unless env write needs it
  NO_RESTART=1
fi

MERGED=()
while IFS= read -r line; do
  [[ -n "$line" ]] && MERGED+=("$line")
done < <(merge_unique "${FOUND[@]}")
if [[ ${#MERGED[@]} -eq 0 ]]; then
  echo "No group JIDs found." >&2
  exit 1
fi

JOINED=$(IFS=,; echo "${MERGED[*]}")
echo "Allowlist JIDs:"
printf '  %s\n' "${MERGED[@]}"

if [[ "$DRY" -eq 1 ]]; then
  echo "(dry-run) would set WHATSAPP_GROUP_ALLOWED_USERS=$JOINED"
  exit 0
fi

write_env "$JOINED"
write_yaml "$JOINED"
echo "Wrote $ENV_FILE and $CFG_FILE"

if [[ "$NO_RESTART" -eq 0 ]]; then
  hermes gateway restart
  echo "Gateway restarted."
fi
