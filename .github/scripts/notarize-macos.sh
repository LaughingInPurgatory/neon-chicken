#!/usr/bin/env bash
# Submit the macOS .zip archives to Apple's notary service. No-ops when Apple
# credentials are absent. Note: a bare CLI executable can't be "stapled"
# (stapling needs an .app/.dmg/.pkg), so Gatekeeper validates the notarization
# ticket online on first launch. This still clears the "unidentified developer"
# block on other machines.
#
# Required secrets to activate (in addition to the macOS signing secrets):
#   APPLE_ID           Apple ID email
#   APPLE_APP_PASSWORD app-specific password for that Apple ID
#   APPLE_TEAM_ID      10-char Apple Developer Team ID
set -euo pipefail

if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "Apple notarization credentials not set — skipping notarization."
  exit 0
fi

shopt -s nullglob
for z in release/*macos*.zip; do
  echo "Notarizing $z"
  xcrun notarytool submit "$z" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
done

echo "Notarization complete."
