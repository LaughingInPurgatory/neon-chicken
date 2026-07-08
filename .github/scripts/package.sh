#!/usr/bin/env bash
# Compress each built binary into a per-platform archive and write checksums.
# macOS -> .zip via ditto (preserves exec bit + code signature, notarization-ready)
# Windows -> .zip   |   Linux -> .tar.gz
set -euo pipefail

mkdir -p release
rm -f release/*

for f in dist/*; do
  base="$(basename "$f")"
  case "$base" in
    *macos*)
      # zip the bare binary at the archive root (notarization-ready)
      ( cd dist && ditto -c -k "$base" "../release/${base}.zip" ) ;;
    *.exe)
      # store the .exe flat inside a .zip named after the platform
      ( cd dist && zip -q -j "../release/${base%.exe}.zip" "$base" ) ;;
    *linux*)
      tar -czf "release/${base}.tar.gz" -C dist "$base" ;;
    *)
      cp "$f" "release/" ;;
  esac
done

# checksums (globbed explicitly so the sums file never hashes itself)
( cd release && shasum -a 256 *.zip *.tar.gz > SHA256SUMS.txt )

echo "Packaged artifacts:"
ls -lh release/
