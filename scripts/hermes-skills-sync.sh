#!/usr/bin/env bash
# Portable Hermes skills + MCP wiring (secret-free).
#
# Official Nous Skill Sync (`hermes sync push/pull`) is still pre-launch and
# admin-gated — this account can opt-in locally but cannot push to the cloud.
# Use this script to move user skills / SOUL / MCP list to another machine.
#
# NEVER packs: .env, auth.json, google_token*.json, google_client_secret.json,
# WhatsApp Baileys session, API keys, or any env values.
#
# Usage:
#   ./scripts/hermes-skills-sync.sh status
#   ./scripts/hermes-skills-sync.sh pack                 # → ~/.hermes/backups/skills-portable/
#   ./scripts/hermes-skills-sync.sh pack /path/out.tgz
#   ./scripts/hermes-skills-sync.sh restore /path/in.tgz
#   ./scripts/hermes-skills-sync.sh restore /path/in.tgz --dry-run
#
# On PC2 after restore:
#   1. Install Hermes Desktop / CLI
#   2. hermes portal login   # same Nous account (e.g. ryodan71@gmail.com)
#   3. Clone ArabicBuzz (or set ARABICBUZZ_ROOT) then restore
#   4. Drive: ./scripts/hermes-drive-setup.sh --from-arabicbuzz   # re-auth if needed
#   5. WhatsApp gateway stays on the always-on Mac unless you re-link WA here

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARABICBUZZ_ROOT="${ARABICBUZZ_ROOT:-$ROOT}"
PACK_DIR_DEFAULT="$HERMES_HOME/backups/skills-portable"
STAMP="$(date +%Y%m%d-%H%M%S)"
PLACEHOLDER='__ARABICBUZZ_ROOT__'

die() { echo "error: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

require_hermes_home() {
  [[ -d "$HERMES_HOME" ]] || die "HERMES_HOME not found: $HERMES_HOME"
}

# Refuse if archive path looks like it would land in git or contain secrets by name.
assert_safe_archive_path() {
  local p="$1"
  case "$p" in
    *.env*|*/.env*|*/auth.json*|*/google_token*|*/platforms/whatsapp*)
      die "refusing archive path that looks secret-related: $p"
      ;;
  esac
}

cmd_status() {
  require_hermes_home
  export PATH="$HERMES_HOME/hermes-agent/venv/bin:$HOME/.local/bin:$HERMES_HOME/bin:$PATH"

  echo "=== Hermes portable skills sync ==="
  echo "HERMES_HOME: $HERMES_HOME"
  echo "ARABICBUZZ_ROOT: $ARABICBUZZ_ROOT"
  echo

  echo "-- Local custom skills --"
  if [[ -d "$HERMES_HOME/skills/local" ]]; then
    find "$HERMES_HOME/skills/local" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort | sed 's/^/  /'
  else
    echo "  (none)"
  fi

  echo
  echo "-- SOUL.md --"
  if [[ -f "$HERMES_HOME/SOUL.md" ]]; then
    echo "  present ($(wc -c <"$HERMES_HOME/SOUL.md" | tr -d ' ') bytes)"
  else
    echo "  missing"
  fi

  echo
  echo "-- Official Skill Sync (Nous cloud) --"
  if have hermes; then
    hermes sync status 2>/dev/null | head -40 || true
    echo
    echo "Note: push/pull require Nous admin entitlement (pre-launch gate)."
    echo "Local opt-in via \`hermes sync enable <skill>\` is ready for when sync GA ships."
  else
    echo "  hermes CLI not on PATH (tried status skipped)"
  fi

  echo
  echo "-- What stays machine-local (never in portable pack) --"
  echo "  ~/.hermes/.env, auth.json, google_token.json, WA Baileys session"
  echo "  LaunchAgents, gateway state, venvs, caches"

  echo
  echo "-- Latest portable packs --"
  if [[ -d "$PACK_DIR_DEFAULT" ]]; then
    ls -lt "$PACK_DIR_DEFAULT"/*.tgz 2>/dev/null | head -5 | sed 's/^/  /' || echo "  (none yet)"
  else
    echo "  (no $PACK_DIR_DEFAULT yet — run: $0 pack)"
  fi
}

# Extract mcp_servers without env values / tokens (stdlib only).
write_mcp_fragment() {
  local out="$1"
  local cfg="$HERMES_HOME/config.yaml"
  [[ -f "$cfg" ]] || { echo "# no config.yaml" >"$out"; return; }

  python3 - "$cfg" "$out" <<'PY'
import json, re, sys
from pathlib import Path

cfg_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
text = cfg_path.read_text(encoding="utf-8", errors="replace")
if "mcp_servers:" not in text:
    out_path.write_text("# mcp_servers: (absent)\n", encoding="utf-8")
    raise SystemExit(0)

block = text.split("mcp_servers:", 1)[1]
lines = ["mcp_servers:"]
skip_env = False
for line in block.splitlines():
    if line and not line[0].isspace() and not line.startswith("#"):
        if re.match(r"^[A-Za-z0-9_]+:", line):
            break
    if re.match(r"^    env:\s*$", line):
        lines.append("    # env: (omitted from portable pack)")
        skip_env = True
        continue
    if skip_env:
        if re.match(r"^      ", line) or re.match(r"^\t\t", line):
            continue
        skip_env = False
    if re.search(r"(?i)(api[_-]?key|token|secret|password|authorization)\s*:", line):
        lines.append(re.sub(r":\s*.*$", ': "(redacted)"', line))
        continue
    lines.append(line)

out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

servers = []
cur = enabled = command = args = None
in_args = False
for line in block.splitlines():
    if line and not line[0].isspace() and not line.startswith("#"):
        if re.match(r"^[A-Za-z0-9_]+:", line):
            break
    m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
    if m:
        if cur is not None:
            servers.append(
                {"name": cur, "enabled": enabled, "command": command, "args": args}
            )
        cur, enabled, command, args, in_args = m.group(1), None, None, None, False
        continue
    m2 = re.match(r"^    enabled:\s*(true|false)\s*$", line)
    if m2 and cur:
        enabled = m2.group(1) == "true"
        continue
    m3 = re.match(r'^    command:\s*["\']?([^"\']+)["\']?\s*$', line)
    if m3 and cur:
        command = m3.group(1).strip()
        continue
    if re.match(r"^    args:\s*$", line) and cur:
        in_args, args = True, []
        continue
    if in_args:
        m4 = re.match(r'^      -\s*["\']?(.+?)["\']?\s*$', line)
        if m4:
            args.append(m4.group(1))
            continue
        if re.match(r"^    [A-Za-z]", line) or re.match(r"^  [A-Za-z]", line):
            in_args = False
if cur is not None:
    servers.append({"name": cur, "enabled": enabled, "command": command, "args": args})

meta = out_path.with_name("mcp_servers.json")
meta.write_text(json.dumps({"mcp_servers": servers}, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out_path.name} + {meta.name} ({len(servers)} servers)", file=sys.stderr)
PY
}

normalize_paths_in_tree() {
  local dir="$1"
  local abs_root="$2"
  [[ -n "$abs_root" && -d "$dir" ]] || return 0
  python3 - "$dir" "$abs_root" "$PLACEHOLDER" <<'PY'
import sys
from pathlib import Path
root, old, new = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
if not old:
    raise SystemExit(0)
exts = {".md", ".sh", ".json", ".yaml", ".yml", ".txt"}
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in exts:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    if old not in text:
        continue
    path.write_text(text.replace(old, new), encoding="utf-8")
PY
}

expand_paths_in_tree() {
  local dir="$1"
  local abs_root="$2"
  [[ -n "$abs_root" && -d "$dir" ]] || return 0
  python3 - "$dir" "$PLACEHOLDER" "$abs_root" <<'PY'
import sys
from pathlib import Path
root, old, new = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
exts = {".md", ".sh", ".json", ".yaml", ".yml", ".txt"}
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in exts:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    if old not in text:
        continue
    path.write_text(text.replace(old, new), encoding="utf-8")
PY
}

write_bin_wrappers() {
  local dest_bin="$1"
  local repo="$2"
  mkdir -p "$dest_bin"
  cat >"$dest_bin/hermes-wa-archive" <<EOF
#!/usr/bin/env bash
exec "$repo/scripts/hermes-wa-drive-archive.sh" "\$@"
EOF
  cat >"$dest_bin/hermes-file-read" <<EOF
#!/usr/bin/env bash
exec "$repo/scripts/hermes-file-read.sh" "\$@"
EOF
  cat >"$dest_bin/hermes-jina-fetch" <<EOF
#!/usr/bin/env bash
exec "$repo/scripts/hermes-jina-fetch.sh" "\$@"
EOF
  cat >"$dest_bin/hermes-storage-mesh" <<EOF
#!/usr/bin/env bash
exec "$repo/scripts/hermes-storage-mesh.sh" "\$@"
EOF
  cat >"$dest_bin/hermes-pdf-dup" <<EOF
#!/usr/bin/env bash
exec "$repo/scripts/hermes-pdf-dup.sh" "\$@"
EOF
  chmod 755 "$dest_bin/hermes-wa-archive" "$dest_bin/hermes-file-read" "$dest_bin/hermes-jina-fetch" "$dest_bin/hermes-storage-mesh" "$dest_bin/hermes-pdf-dup"
}

cmd_pack() {
  require_hermes_home
  local out="${1:-}"
  mkdir -p "$PACK_DIR_DEFAULT"
  chmod 700 "$HERMES_HOME/backups" 2>/dev/null || true
  chmod 700 "$PACK_DIR_DEFAULT" 2>/dev/null || true

  local stage
  stage="$(mktemp -d "${TMPDIR:-/tmp}/hermes-skills-pack.XXXXXX")"
  # shellcheck disable=SC2064
  trap 'rm -rf "'"$stage"'"' EXIT

  local bundle="$stage/hermes-skills-portable"
  mkdir -p "$bundle/skills/local" "$bundle/meta" "$bundle/bin-wrappers"

  # Custom local skills only (not entire bundled tree)
  if [[ -d "$HERMES_HOME/skills/local" ]]; then
    cp -R "$HERMES_HOME/skills/local/." "$bundle/skills/local/" 2>/dev/null || true
  fi

  # SOUL
  if [[ -f "$HERMES_HOME/SOUL.md" ]]; then
    cp "$HERMES_HOME/SOUL.md" "$bundle/SOUL.md"
  fi

  # MCP fragment (no secrets)
  write_mcp_fragment "$bundle/meta/mcp_servers.yaml"
  # Normalize absolute ArabicBuzz paths inside MCP meta (filesystem args, etc.)
  normalize_paths_in_tree "$bundle/meta" "$ARABICBUZZ_ROOT"
  if [[ -d "$HOME/Desktop/ArabicBuzz" && "$ARABICBUZZ_ROOT" != "$HOME/Desktop/ArabicBuzz" ]]; then
    normalize_paths_in_tree "$bundle/meta" "$HOME/Desktop/ArabicBuzz"
  fi
  # Bare Desktop allow-path → portable token (restore expands to $HOME/Desktop)
  if [[ -d "$HOME/Desktop" ]]; then
    python3 - "$bundle/meta" "$HOME/Desktop" <<'PY'
import sys
from pathlib import Path
root, desktop = Path(sys.argv[1]), sys.argv[2]
token = "__HOME_DESKTOP__"
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in {".json", ".yaml", ".yml", ".md", ".txt"}:
        continue
    text = path.read_text(encoding="utf-8")
    if desktop in text:
        path.write_text(text.replace(desktop, token), encoding="utf-8")
PY
  fi

  # Hub / official skill snapshot (reinstall recipe — no payloads with secrets)
  export PATH="$HERMES_HOME/hermes-agent/venv/bin:$HOME/.local/bin:$HERMES_HOME/bin:$PATH"
  if have hermes; then
    hermes skills snapshot export "$bundle/meta/skills-snapshot.json" 2>/dev/null || true
    hermes sync status >"$bundle/meta/sync-status.json" 2>/dev/null || true
  fi

  # Manifest
  cat >"$bundle/meta/MANIFEST.json" <<EOF
{
  "format": "arabicbuzz-hermes-skills-portable/v1",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_host": "$(hostname -s 2>/dev/null || hostname)",
  "hermes_home_note": "~/.hermes (machine-local secrets excluded)",
  "excludes": [".env", "auth.json", "google_token.json", "google_client_secret.json", "platforms/whatsapp", "session", "*.pem"],
  "arabicbuzz_placeholder": "$PLACEHOLDER",
  "local_skills": $(find "$bundle/skills/local" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sort | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))'),
  "companion_scripts": [
    "scripts/hermes-wa-drive-archive.sh",
    "scripts/hermes-file-read.sh",
    "scripts/hermes-jina-fetch.sh",
    "scripts/hermes-drive-setup.sh",
    "scripts/hermes-tools-status.sh"
  ],
  "restore_notes": [
    "hermes portal login (same Nous account)",
    "restore this archive",
    "clone ArabicBuzz and set ARABICBUZZ_ROOT if needed",
    "Drive OAuth: hermes-drive-setup.sh --from-arabicbuzz",
    "WA Baileys session is NOT transferred — keep gateway on always-on Mac or re-link"
  ]
}
EOF

  cat >"$bundle/README.md" <<'EOF'
# Hermes portable skills pack (ArabicBuzz)

Secret-free bundle of local skills + SOUL + MCP server list.

## Restore on another machine

```bash
# 1) Install Hermes, then log in with the SAME Nous account
hermes portal login

# 2) Clone ArabicBuzz (needed for companion scripts / bin wrappers)
git clone <your-arabicbuzz-remote> ~/ArabicBuzz
cd ~/ArabicBuzz

# 3) Restore
./scripts/hermes-skills-sync.sh restore /path/to/hermes-skills-portable-….tgz

# 4) Google Drive (tokens are machine-local — re-auth)
./scripts/hermes-drive-setup.sh --from-arabicbuzz
./scripts/hermes-drive-setup.sh --probe

# 5) Optional: re-install hub skills from snapshot
#    hermes skills snapshot import meta/skills-snapshot.json   # if supported after extract
```

## Not included (by design)

- `~/.hermes/.env`, `auth.json`
- Google OAuth tokens / client secret
- WhatsApp Baileys session (`platforms/whatsapp`)
- Full `hermes backup` zip (that one *does* include secrets — keep offline only)

## Official cloud Skill Sync

`hermes sync` exists but is **admin-gated / pre-launch**. Local `hermes sync enable` marks skills for when Nous opens the feature. Until then, use this portable pack.
EOF

  # Normalize absolute repo paths inside packed skills/SOUL
  normalize_paths_in_tree "$bundle" "$ARABICBUZZ_ROOT"
  # Also normalize this user's home-absolute Desktop path variants if present
  if [[ "$ARABICBUZZ_ROOT" != "$HOME/Desktop/ArabicBuzz" && -d "$HOME/Desktop/ArabicBuzz" ]]; then
    normalize_paths_in_tree "$bundle" "$HOME/Desktop/ArabicBuzz"
  fi

  # Template bin wrappers (use placeholder; restore expands)
  write_bin_wrappers "$bundle/bin-wrappers" "$PLACEHOLDER"

  if [[ -z "$out" ]]; then
    out="$PACK_DIR_DEFAULT/hermes-skills-portable-$STAMP.tgz"
  fi
  assert_safe_archive_path "$out"
  mkdir -p "$(dirname "$out")"

  tar -C "$stage" -czf "$out" hermes-skills-portable
  chmod 600 "$out"
  # sha256
  if have shasum; then
    shasum -a 256 "$out" | awk '{print $1}' >"${out}.sha256"
    chmod 600 "${out}.sha256"
  elif have sha256sum; then
    sha256sum "$out" | awk '{print $1}' >"${out}.sha256"
    chmod 600 "${out}.sha256"
  fi

  echo "Packed (secret-free): $out"
  echo "WARNING: keep this archive private; still contains your SOUL + skill text (not API keys)."
  echo "Do NOT commit to git. Local copies under ~/.hermes/backups/ are OK."
  tar -tzf "$out" | head -40
  echo "…"
  echo "files: $(tar -tzf "$out" | wc -l | tr -d ' ')"
  rm -rf "$stage"
  trap - EXIT
}

merge_mcp_into_config() {
  local fragment="$1"
  local cfg="$HERMES_HOME/config.yaml"
  [[ -f "$fragment" ]] || return 0
  if [[ ! -f "$cfg" ]]; then
    echo "No config.yaml yet — copying MCP fragment aside for manual merge:"
    cp "$fragment" "$HERMES_HOME/mcp_servers.portable.yaml"
    echo "  → $HERMES_HOME/mcp_servers.portable.yaml"
    return 0
  fi
  # Non-destructive: write fragment beside config; user/Hermes can merge
  cp "$fragment" "$HERMES_HOME/mcp_servers.portable.yaml"
  if [[ -f "${fragment%.yaml}.json" ]] || [[ -f "$(dirname "$fragment")/mcp_servers.json" ]]; then
    cp "$(dirname "$fragment")/mcp_servers.json" "$HERMES_HOME/mcp_servers.portable.json" 2>/dev/null || true
  fi
  echo "MCP fragment saved (not auto-merged — review then paste into config.yaml):"
  echo "  $HERMES_HOME/mcp_servers.portable.yaml"
}

cmd_restore() {
  local archive="${1:-}"
  local dry=0
  shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry=1 ;;
      *) die "unknown restore flag: $1" ;;
    esac
    shift
  done
  [[ -n "$archive" ]] || die "usage: $0 restore <archive.tgz> [--dry-run]"
  [[ -f "$archive" ]] || die "archive not found: $archive"
  assert_safe_archive_path "$archive"

  # Verify checksum if present
  if [[ -f "${archive}.sha256" ]]; then
    local expect actual
    expect="$(tr -d ' \n' <"${archive}.sha256" | awk '{print $1}')"
    if have shasum; then
      actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
    else
      actual="$(sha256sum "$archive" | awk '{print $1}')"
    fi
    [[ "$expect" == "$actual" ]] || die "sha256 mismatch for $archive"
    echo "sha256 OK"
  fi

  local stage
  stage="$(mktemp -d "${TMPDIR:-/tmp}/hermes-skills-restore.XXXXXX")"
  # shellcheck disable=SC2064
  trap 'rm -rf "'"$stage"'"' EXIT
  tar -C "$stage" -xzf "$archive"
  local bundle="$stage/hermes-skills-portable"
  [[ -d "$bundle" ]] || die "archive missing hermes-skills-portable/ root"

  # Safety scan: refuse if archive smuggled secrets
  if find "$bundle" -type f \( \
      -name '.env' -o -name 'auth.json' -o -name 'google_token.json' \
      -o -name 'google_client_secret.json' -o -name '*.pem' \
      -o -path '*/platforms/whatsapp/*' -o -name 'creds.json' \
    \) | grep -q .; then
    die "archive contains secret-looking files — refusing restore"
  fi

  echo "ARABICBUZZ_ROOT=$ARABICBUZZ_ROOT"
  expand_paths_in_tree "$bundle" "$ARABICBUZZ_ROOT"
  # Expand Desktop token
  python3 - "$bundle" "$HOME/Desktop" <<'PY'
import sys
from pathlib import Path
root, desktop = Path(sys.argv[1]), sys.argv[2]
token = "__HOME_DESKTOP__"
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in {".json", ".yaml", ".yml", ".md", ".txt", ".sh"}:
        continue
    text = path.read_text(encoding="utf-8")
    if token in text:
        path.write_text(text.replace(token, desktop), encoding="utf-8")
PY

  if [[ "$dry" -eq 1 ]]; then
    echo "[dry-run] would restore:"
    find "$bundle" -type f | sed "s|^$bundle/|  |"
    exit 0
  fi

  require_hermes_home
  mkdir -p "$HERMES_HOME/skills/local" "$HERMES_HOME/bin"

  if [[ -d "$bundle/skills/local" ]]; then
    cp -R "$bundle/skills/local/." "$HERMES_HOME/skills/local/"
    echo "Restored skills → $HERMES_HOME/skills/local/"
  fi

  if [[ -f "$bundle/SOUL.md" ]]; then
    if [[ -f "$HERMES_HOME/SOUL.md" ]]; then
      cp "$HERMES_HOME/SOUL.md" "$HERMES_HOME/SOUL.md.bak-before-portable-$STAMP"
    fi
    cp "$bundle/SOUL.md" "$HERMES_HOME/SOUL.md"
    echo "Restored SOUL.md"
  fi

  if [[ -f "$bundle/meta/mcp_servers.yaml" ]]; then
    merge_mcp_into_config "$bundle/meta/mcp_servers.yaml"
  fi

  if [[ -d "$bundle/bin-wrappers" ]]; then
    write_bin_wrappers "$HERMES_HOME/bin" "$ARABICBUZZ_ROOT"
    echo "Wrote bin wrappers in $HERMES_HOME/bin → $ARABICBUZZ_ROOT/scripts/"
  fi

  # Re-apply sync opt-in locally (cloud push still gated)
  export PATH="$HERMES_HOME/hermes-agent/venv/bin:$HOME/.local/bin:$HERMES_HOME/bin:$PATH"
  if have hermes; then
    while IFS= read -r skill; do
      [[ -n "$skill" ]] || continue
      hermes sync enable "$skill" 2>/dev/null || true
    done < <(find "$HERMES_HOME/skills/local" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)
  fi

  # Hub skill reinstall hints
  if [[ -f "$bundle/meta/skills-snapshot.json" ]]; then
    cp "$bundle/meta/skills-snapshot.json" "$HERMES_HOME/skills-snapshot.portable.json"
    echo "Hub snapshot saved: $HERMES_HOME/skills-snapshot.portable.json"
    echo "Reinstall with: hermes skills snapshot import $HERMES_HOME/skills-snapshot.portable.json"
  fi

  echo
  echo "Restore done."
  echo "Next:"
  echo "  hermes portal login          # same Nous account if not already"
  echo "  ./scripts/hermes-drive-setup.sh --from-arabicbuzz"
  echo "  ./scripts/hermes-tools-status.sh"
  echo "WhatsApp: do NOT copy Baileys session here unless intentional; prefer gateway on always-on Mac."
  rm -rf "$stage"
  trap - EXIT
}

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    status) cmd_status "$@" ;;
    pack) cmd_pack "$@" ;;
    restore) cmd_restore "$@" ;;
    -h|--help|help|"") usage ;;
    *) die "unknown command: $cmd (try: status|pack|restore)" ;;
  esac
}

main "$@"
