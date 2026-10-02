#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")" && pwd)"
node "$ROOT/node-host/cli.mjs" check
printf '%s\n' '按回车关闭此窗口。'
read -r
