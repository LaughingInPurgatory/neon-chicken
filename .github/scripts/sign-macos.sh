#!/usr/bin/env bash
# Codesign the macOS binaries with a Developer ID identity (hardened runtime),
# so they can be notarized. No-ops (leaving pkg's ad-hoc signature) when the
# signing secrets are absent, so the workflow still succeeds without them.
#
# Required secrets to activate:
#   MACOS_CERTIFICATE      base64 of a "Developer ID Application" .p12
#   MACOS_CERTIFICATE_PWD  the .p12 export password
#   MACOS_SIGN_IDENTITY    e.g. "Developer ID Application: Your Name (TEAMID)"
set -euo pipefail

if [ -z "${MACOS_CERTIFICATE:-}" ] || [ -z "${MACOS_CERTIFICATE_PWD:-}" ] || [ -z "${MACOS_SIGN_IDENTITY:-}" ]; then
  echo "macOS signing secrets not set — keeping pkg's ad-hoc signature (fine for local use)."
  exit 0
fi

KEYCHAIN="build.keychain"
KEYCHAIN_PWD="$(openssl rand -base64 24)"

security create-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN"

echo "$MACOS_CERTIFICATE" | base64 --decode > cert.p12
security import cert.p12 -k "$KEYCHAIN" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PWD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" login.keychain
rm -f cert.p12

for b in dist/*macos*; do
  echo "Signing $b"
  codesign --force --timestamp --options runtime --sign "$MACOS_SIGN_IDENTITY" "$b"
  codesign --verify --strict --verbose=2 "$b"
done

echo "macOS binaries signed with Developer ID."
