#!/bin/bash
set -uo pipefail

ROOT="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
ACTION="${1:-check}"
case "$ACTION" in
  init) LABEL='初始化' ;;
  check) LABEL='环境检查' ;;
  rollback) LABEL='回退' ;;
  uninstall) LABEL='卸载' ;;
  *) printf '%s\n' '未知操作。' >&2; exit 1 ;;
esac

FORMATTER_NODE_BIN="$(type -P node || true)"
if [ -z "$FORMATTER_NODE_BIN" ]; then
  for CANDIDATE in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$CANDIDATE" ]; then FORMATTER_NODE_BIN="$CANDIDATE"; break; fi
  done
fi
STATUS=1
if [ -z "$FORMATTER_NODE_BIN" ]; then
  printf '%s\n' '当前环境找不到 Node.js。请从 nodejs.org 安装 macOS arm64 版 Node.js 22 或 24 LTS；若已安装，请重新打开终端并确认 Node 所在目录已加入 PATH。' >&2
else
  if [[ "$FORMATTER_NODE_BIN" != /* ]]; then
    FORMATTER_NODE_BIN="$(cd "$(/usr/bin/dirname "$FORMATTER_NODE_BIN")" && pwd)/${FORMATTER_NODE_BIN##*/}"
  fi
  printf '使用 Node：%s\n' "$FORMATTER_NODE_BIN"
  "$FORMATTER_NODE_BIN" "$ROOT/node-host/cli.mjs" "$ACTION"
  STATUS=$?
fi

if [ "$STATUS" -eq 0 ]; then
  if [ "$ACTION" = uninstall ]; then
    printf '%s\n' '卸载的本地操作已完成。'
  else
    printf '%s的本地操作已完成。请重新打开 WPS，并在“一键排版 → 环境检查”核对插件连接。\n' "$LABEL"
  fi
else
  printf '%s未完成（退出码 %s）。请查看上方原因。\n' "$LABEL" "$STATUS" >&2
fi
if [ -t 0 ]; then
  printf '%s\n' '按回车关闭此窗口。'
  IFS= read -r || true
fi
exit "$STATUS"
