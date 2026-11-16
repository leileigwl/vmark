#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
pnpm dev
