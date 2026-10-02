#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--no-build" ]]; then bash scripts/build.sh; fi
VERSION="$(node -p 'require("./package.json").version')"
mkdir -p release
python3 scripts/package-zip.py "$VERSION"
(
  cd release
  shasum -a 256 "wps-local-formatter-$VERSION-arm64.zip" "wps-local-formatter-$VERSION-source.zip" > "wps-local-formatter-$VERSION-SHA256SUMS.txt"
)
