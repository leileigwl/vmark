#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

MIGRATE_UP_CMD="${MIGRATE_UP_CMD:-pnpm db:migrate:up}"
MIGRATE_SEED_CMD="${MIGRATE_SEED_CMD:-pnpm db:seed}"
MIGRATE_DOWN_CMD="${MIGRATE_DOWN_CMD:-pnpm db:migrate:down}"

run_step() {
  local label="$1"
  local cmd="$2"
  echo "[migration-check] Step: $label -> $cmd"
  if [[ "$DRY_RUN" == "true" ]]; then
    return 0
  fi
  eval "$cmd"
}

echo "[migration-check] Verifying bidirectional reversibility (up -> seed -> down -> up)"
run_step "migrate up (1)" "$MIGRATE_UP_CMD"
run_step "seed fixture data" "$MIGRATE_SEED_CMD"
run_step "migrate down (rollback)" "$MIGRATE_DOWN_CMD"
run_step "migrate up (2 - re-apply clean)" "$MIGRATE_UP_CMD"
echo "[migration-check] Reversibility check completed cleanly."
