#!/usr/bin/env bash
# Simulates the GitHub Actions CI workflow locally.
# Runs the same steps as .github/workflows/ci.yml
# Usage: ./scripts/ci-local.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() {
  echo -e "\n${YELLOW}=== $1 ===${NC}"
}

fail() {
  echo -e "${RED}FAILED: $1${NC}"
  exit 1
}

pass() {
  echo -e "${GREEN}PASSED: $1${NC}"
}

# Check prerequisites
step "Checking prerequisites"
if ! docker info >/dev/null 2>&1; then
  fail "Docker is not running"
fi
echo "Docker: OK"

# Ensure dev services are up (needed for E2E)
step "Starting dev services (PostgreSQL + Redis)"
pnpm dev:services 2>/dev/null || true
sleep 2
pass "Dev services"

# Job 1: Lint & Typecheck
step "Job 1: Lint & Typecheck"
pnpm check || fail "Lint"
pass "Lint"
pnpm typecheck || fail "Typecheck"
pass "Typecheck"

# Job 2: Unit & Integration Tests
step "Job 2: Unit & Integration Tests"
pnpm --filter @sigilpanel/db db:generate || fail "db:generate"
pnpm test || fail "Unit & Integration Tests"
pass "Unit & Integration Tests"

# Job 3: E2E Tests
step "Job 3: E2E Tests (Playwright)"
pnpm --filter @sigilpanel/db db:migrate || fail "db:migrate"
# Stop any running dev servers so Playwright can start its own
lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs -r kill 2>/dev/null || true
sleep 1
pnpm --filter @sigilpanel/panel test:e2e || fail "E2E Tests"
pass "E2E Tests"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}ALL CI CHECKS PASSED${NC}"
echo -e "${GREEN}========================================${NC}"
