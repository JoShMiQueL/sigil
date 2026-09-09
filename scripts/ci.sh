#!/usr/bin/env bash
# Single source of truth for CI checks.
# Called by .github/workflows/ci.yml AND runnable locally.
# Usage:
#   ./scripts/ci.sh              # run all jobs (local)
#   ./scripts/ci.sh lint         # run one job
#   ./scripts/ci.sh unit
#   ./scripts/ci.sh e2e

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
fail() { echo -e "${RED}FAILED: $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}PASSED: $1${NC}"; }

job_lint() {
  step "Lint & Typecheck"
  pnpm check || fail "Lint"
  pass "Lint"
  pnpm typecheck || fail "Typecheck"
  pass "Typecheck"
}

job_unit() {
  step "Unit & Integration Tests"
  pnpm --filter @sigilpanel/db db:generate || fail "db:generate"
  pnpm test || fail "Unit & Integration Tests"
  pass "Unit & Integration Tests"
}

job_e2e() {
  step "E2E Tests (Playwright)"
  pnpm --filter @sigilpanel/db db:migrate || fail "db:migrate"
  # Stop any running dev servers so Playwright can start its own
  lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null || true
  lsof -ti:5173 2>/dev/null | xargs -r kill 2>/dev/null || true
  sleep 1
  pnpm --filter @sigilpanel/panel test:e2e || fail "E2E Tests"
  pass "E2E Tests"
}

job_all() {
  job_lint
  job_unit
  job_e2e
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}ALL CI CHECKS PASSED${NC}"
  echo -e "${GREEN}========================================${NC}"
}

# When running locally (no CI env), ensure dev services are up
if [ -z "${CI:-}" ]; then
  step "Checking prerequisites"
  docker info >/dev/null 2>&1 || fail "Docker is not running"
  echo "Docker: OK"
  pnpm dev:services 2>/dev/null || true
  sleep 2
fi

case "${1:-all}" in
  lint)    job_lint ;;
  unit)    job_unit ;;
  e2e)     job_e2e ;;
  all)     job_all ;;
  *)       echo "Unknown job: $1"; echo "Usage: $0 [lint|unit|e2e|all]"; exit 1 ;;
esac
