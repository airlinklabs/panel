#!/usr/bin/env bash
# Compile Lingui message catalogs into JS files for production.
# Run from project root: bash scripts/lingui-compile.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npx lingui compile "$@"
