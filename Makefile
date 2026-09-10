.PHONY: install check typecheck test test-e2e ci e2e-services-up e2e-services-down

install:
	bun install

check:
	bun check

typecheck:
	bun typecheck

test:
	bun --filter @sigil/db db:generate
	bun run test

test-e2e:
	bun --filter @sigil/db db:generate
	bun run test:e2e

# Full CI simulation: same 3 jobs as .github/workflows/ci.yml
ci: check typecheck test test-e2e
	@echo "All CI checks passed."

# Local dev: start PostgreSQL + Redis via Docker
e2e-services-up:
	bun dev:services

e2e-services-down:
	bun dev:services:down
