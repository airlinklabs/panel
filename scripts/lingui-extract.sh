#!/usr/bin/env bash
# Extract message catalogs from source files using Lingui CLI.
# Run from project root: bash scripts/lingui-extract.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npx lingui extract --clean "$@"
