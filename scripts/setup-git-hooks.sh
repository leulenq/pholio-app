#!/bin/sh
set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT/.githooks"

chmod +x "$HOOKS_DIR/prepare-commit-msg"
git -C "$ROOT" config core.hooksPath .githooks

echo "Git hooks installed (.githooks/prepare-commit-msg strips AI co-author trailers)."
