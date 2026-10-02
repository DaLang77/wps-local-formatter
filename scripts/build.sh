#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'const n=Number(process.versions.node.split(".")[0]);if(![22,24].includes(n))throw Error("需要 Node.js 22 或 24 LTS")'
npm ci --omit=dev --ignore-scripts
VERSION="$(node -p 'require("./package.json").version')"
DEST="$PWD/dist/wps-local-formatter-$VERSION"
mkdir -p dist
STAGE="$(mktemp -d "$PWD/dist/.node-build.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cp -R addin node-host node_modules "$STAGE/"
cp package.json package-lock.json LICENSE NOTICE.md "$STAGE/"
cp docs/安装说明.md "$STAGE/使用说明.md"
cp docs/验证记录.md "$STAGE/验证记录.md"
cp 初始化.command 环境检查.command 回退.command 卸载.command "$STAGE/"
node scripts/build-id.cjs "$STAGE"
rm -rf "$DEST"
mv "$STAGE" "$DEST"
printf '%s\n' "$DEST"
