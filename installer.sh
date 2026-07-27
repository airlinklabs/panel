#!/usr/bin/env bash
set -euo pipefail

DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DIR}/installer.mjs"

if [[ ! -f "$TARGET" ]]; then
  echo "Missing ${TARGET}" >&2
  exit 1
fi

if command -v bun >/dev/null 2>&1; then
  exec bun "$TARGET" "$@"
fi

if command -v node >/dev/null 2>&1; then
  exec node --experimental-ffi "$TARGET" "$@"
fi

echo "Need Bun or Node.js 26.4+ with --experimental-ffi" >&2
exit 1
