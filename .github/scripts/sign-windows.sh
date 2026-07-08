#!/usr/bin/env bash
# Authenticode-sign the Windows .exe files with osslsigncode. No-ops when the
# Windows signing secrets are absent.
#
# Required secrets to activate:
#   WINDOWS_CERTIFICATE      base64 of a code-signing .pfx/.p12
#   WINDOWS_CERTIFICATE_PWD  the .pfx export password
set -euo pipefail

if [ -z "${WINDOWS_CERTIFICATE:-}" ] || [ -z "${WINDOWS_CERTIFICATE_PWD:-}" ]; then
  echo "Windows signing secrets not set — skipping Windows signing."
  exit 0
fi

if ! command -v osslsigncode >/dev/null 2>&1; then
  brew install osslsigncode
fi

echo "$WINDOWS_CERTIFICATE" | base64 --decode > win-cert.p12

shopt -s nullglob
for e in dist/*.exe; do
  echo "Signing $e"
  osslsigncode sign \
    -pkcs12 win-cert.p12 -pass "$WINDOWS_CERTIFICATE_PWD" \
    -n "JOUST — Neon Edition" \
    -i "https://github.com/schtufbox/joust-web26" \
    -ts http://timestamp.digicert.com \
    -in "$e" -out "${e}.signed"
  mv "${e}.signed" "$e"
done
rm -f win-cert.p12

echo "Windows binaries signed."
