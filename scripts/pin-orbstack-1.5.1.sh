#!/usr/bin/env bash
# Keep OrbStack on 1.5.1 on this Mac — disable Sparkle auto-update checks.
# Laptop OrbStack is NOT 24/7; see docs/telegram-always-on-bot-api.md for VPS.
#
# Usage: ./scripts/pin-orbstack-1.5.1.sh

set -euo pipefail

PLIST_DOMAIN="dev.orbstack.OrbStack"
APP_PLIST="/Applications/OrbStack.app/Contents/Info.plist"

echo "════════════════════════════════════════"
echo " Arabic Buzz · pin OrbStack 1.5.1"
echo "════════════════════════════════════════"

if [[ -f "$APP_PLIST" ]]; then
  ver=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP_PLIST" 2>/dev/null || echo '?')
  echo "Installed: $ver"
  if [[ "$ver" != "1.5.1" ]]; then
    echo "⚠️  Expected 1.5.1 — current is $ver. Do not upgrade from OrbStack UI." >&2
  else
    echo "✅ Version is 1.5.1"
  fi
else
  echo "OrbStack.app not found under /Applications — skip version check."
fi

# Sparkle (SU*) — disable automatic update checks + auto-download
defaults write "$PLIST_DOMAIN" SUEnableAutomaticChecks -bool false
defaults write "$PLIST_DOMAIN" SUAutomaticallyUpdate -bool false
# Last check far in the past / skip prompts when possible
defaults write "$PLIST_DOMAIN" SUHasLaunchedBefore -bool true 2>/dev/null || true

echo "Sparkle auto-update: SUEnableAutomaticChecks=0 SUAutomaticallyUpdate=0"
echo ""
echo "Notes:"
echo "  • Mac sleep still kills Local Bot API — for 24/7 use VPS + TELEGRAM_BOT_API_URL"
echo "  • One-command Local Bot API: npm run telegram:bot-api-setup"
echo "  • Mac hop: npm run storage:sync:up  (agent + tunnel helper)"
echo "════════════════════════════════════════"
