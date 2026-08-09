#!/usr/bin/env bash
# Ensure cloudflared binary exists at a durable path (not only /tmp).
# Prefers: ~/bin/cloudflared → /usr/local/bin/cloudflared → /tmp/cloudflared → download

set -euo pipefail

DEST="${CLOUDFLARED_BIN:-$HOME/bin/cloudflared}"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) CF_ARCH="darwin-arm64" ;;
  *) CF_ARCH="darwin-amd64" ;;
esac

find_existing() {
  for c in \
    "$DEST" \
    "$HOME/bin/cloudflared" \
    /usr/local/bin/cloudflared \
    /opt/homebrew/bin/cloudflared \
    /tmp/cloudflared \
    "$(command -v cloudflared 2>/dev/null || true)"; do
    if [[ -n "$c" && -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

if EXISTING="$(find_existing)"; then
  # Prefer durable copy under ~/bin
  if [[ "$EXISTING" != "$DEST" ]]; then
    mkdir -p "$(dirname "$DEST")"
    if [[ ! -x "$DEST" ]]; then
      cp "$EXISTING" "$DEST"
      chmod +x "$DEST"
    fi
  fi
  echo "$DEST"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${CF_ARCH}"
echo "Downloading cloudflared (${CF_ARCH})…" >&2
curl -fsSL -o "$DEST" "$URL"
chmod +x "$DEST"
echo "$DEST"
