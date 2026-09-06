# Docker workflow shortcuts. Requires Docker Compose v2 (the `docker compose`
# subcommand, not the standalone `docker-compose` binary).
.PHONY: env up down build restart logs ps migrate migrate-status seed admin clean

# Copies each .env.example to .env the first time only — an existing .env is
# never overwritten, so re-running this never undoes local configuration.
env:
	@test -f .env || cp .env.example .env
	@test -f backend/.env || cp backend/.env.example backend/.env
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
