#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--no-build" ]]; then bash scripts/build.sh; fi
mkdir -p release build/package
PACKAGE="$(mktemp -d "$PWD/build/package/release.XXXXXX")"
trap 'rm -rf "$PACKAGE"' EXIT
cp -R "dist/WPS一键排版.app" "$PACKAGE/"
cp docs/安装说明.md "$PACKAGE/安装说明.md"
cp LICENSE "$PACKAGE/许可证.txt"
hdiutil create -volname "WPS 一键排版" -srcfolder "$PACKAGE" -ov -format UDZO "release/wps-local-formatter-1.1.0-beta.4-arm64.dmg"
SOURCE="$PACKAGE/wps-local-formatter"
mkdir -p "$SOURCE"
cp -R Sources addin scripts tests docs .github README.md CONTRIBUTING.md NOTICE.md LICENSE .gitignore "$SOURCE/"
# Only reusable source and synthetic generators belong in the public archive.
find "$SOURCE" -type d -name __pycache__ -prune -exec rm -rf {} +
find "$SOURCE" -type f \( -name '*.docx' -o -name '*.pdf' -o -name '.DS_Store' \) -delete
rm -rf "$SOURCE/docs/plans"
python3 - "$SOURCE" "release/wps-local-formatter-1.1.0-beta.4-source.zip" <<'PYZIP'
from pathlib import Path
import sys, zipfile
source=Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(source.parent))
PYZIP
(
    cd release
    shasum -a 256 wps-local-formatter-1.1.0-beta.4-arm64.dmg wps-local-formatter-1.1.0-beta.4-source.zip > SHA256SUMS.txt
)
