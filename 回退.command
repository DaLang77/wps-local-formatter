#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(/usr/bin/dirname "$0")" && pwd)"
exec /bin/bash "$ROOT/node-host/launch.sh" rollback
