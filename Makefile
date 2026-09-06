# Docker workflow shortcuts. Requires Docker Compose v2 (the `docker compose`
# subcommand, not the standalone `docker-compose` binary).
.PHONY: env up down build restart logs ps migrate migrate-status seed admin clean

# Copies each .env.example to .env the first time only — an existing .env is
# never overwritten, so re-running this never undoes local configuration.
#
# The two secrets that must never be "postgres" or "change-me" in anything
# but a throwaway local database — DB_PASSWORD and JWT_SECRET — are replaced
# with a random value at the moment the file is created, so the documented
# path (`make env && make up`) never actually produces a weak one. Copying
# the .env.example files by hand instead still leaves their placeholders,
# which is what those placeholders' own comments are there to warn about.
env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		password=$$(openssl rand -base64 24 | tr -d '=\n'); \
		sed -i.bak "s#^DB_PASSWORD=.*#DB_PASSWORD=$$password#" .env && rm -f .env.bak; \
		echo "generated a random DB_PASSWORD in .env"; \
	fi
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		secret=$$(openssl rand -base64 32 | tr -d '=\n'); \
		sed -i.bak "s#^JWT_SECRET=.*#JWT_SECRET=$$secret#" backend/.env && rm -f backend/.env.bak; \
		echo "generated a random JWT_SECRET in backend/.env"; \
	fi
	@echo ".env and backend/.env ready"

## Brings up the whole stack: PostgreSQL, migrations, the reference-data
## seed, the API, and the frontend. Safe to run again — migrate and seed are
## both idempotent, and `up` only (re)creates what actually changed.
up: env
	docker compose up --build -d

down:
	docker compose down

## Rebuilds the images without starting anything, for when only `up` is too
## slow to iterate with.
build:
	docker compose build

restart:
	docker compose restart backend frontend

logs:
	docker compose logs -f backend frontend

ps:
	docker compose ps

## Re-runs migrations against the running stack, past what `up` already did —
## for applying a migration added after the stack was last brought up.
migrate:
	docker compose run --rm migrate up

migrate-status:
	docker compose run --rm migrate status

seed:
	docker compose run --rm seed

## Creates the first owner account. Requires ADMIN_OWNER_NAME,
## ADMIN_OWNER_EMAIL and ADMIN_OWNER_PASSWORD in backend/.env — see
## backend/.env.example. Safe to run again: with an owner already present it
## changes nothing.
admin:
	docker compose run --rm --entrypoint /app/admin backend

## Stops the stack and removes its volumes — the database and uploaded files
## go with them. Not run by anything else here; only ever by hand.
clean:
	docker compose down -v
