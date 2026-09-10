.PHONY: install check typecheck test test-e2e ci e2e-services-up e2e-services-down

install:
	pnpm install --frozen-lockfile

check:
	pnpm check

typecheck:
	pnpm typecheck

test:
	pnpm --filter @sigilpanel/db db:generate
	pnpm test

test-e2e:
	pnpm --filter @sigilpanel/db db:generate
	pnpm test:e2e

# Full CI simulation: same 3 jobs as .github/workflows/ci.yml
ci: check typecheck test test-e2e
	@echo "All CI checks passed."

# Local dev: start PostgreSQL + Redis via Docker
e2e-services-up:
	pnpm dev:services

e2e-services-down:
	pnpm dev:services:down
