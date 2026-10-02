#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null; then printf '%s\n' '请先从 nodejs.org 安装 Node.js 22 或 24 LTS，再运行初始化。'; read -r; exit 1; fi
node "$ROOT/node-host/cli.mjs" init
printf '%s\n' '按回车关闭此窗口。'
read -r
