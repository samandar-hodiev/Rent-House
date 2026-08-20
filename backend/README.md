# RentHouse Backend

REST API for RentHouse, an apartment rental platform for Tashkent.

Phases complete so far:

1. **Foundation** — configuration, database connection, logging, CORS, health check.
2. **Database architecture** — models, migrations, reference seed data.
3. **Authentication** — registration, login, JWT access tokens, protected routes.

Apartment CRUD, favourites, chat and image upload arrive in later phases.

## Tech stack

- Go 1.25
- Gin — HTTP routing and middleware
- GORM + `gorm.io/driver/postgres` — database access
- PostgreSQL 14+
- `joho/godotenv` — loads `.env` in development

## Requirements

- Go 1.25 or newer
- A running PostgreSQL server

## PostgreSQL setup

Create the database the API connects to:

```sql
CREATE DATABASE renthouse;
```

Or from the shell:

```bash
createdb -U postgres renthouse
```

Then create the schema and load reference data:

```bash
go run ./cmd/migrate up   # create tables, indexes and constraints
go run ./cmd/seed         # insert districts and amenities
```

Both are safe to run repeatedly.

## Migrations

The schema lives in `migrations/` as plain SQL, one numbered pair per change
(`0001_init.up.sql` / `0001_init.down.sql`). A `schema_migrations` table records
which versions have run.

`AutoMigrate` is **not** used and the server never changes the schema on
startup: a restart must never alter a production database. Migrations are a
deliberate step run by a separate binary.

```bash
go run ./cmd/migrate up       # apply everything pending
go run ./cmd/migrate status   # list applied and pending migrations
go run ./cmd/migrate down --confirm   # roll back the newest migration (destructive)
```

Each migration runs inside a transaction together with its ledger entry, so a
failure leaves neither a half-applied schema nor a false record of success.
`down` drops tables and therefore requires `--confirm`; nothing else in the
codebase calls it.

To add a change, create the next numbered pair — never edit an applied
migration, since databases that already ran it would not pick up the edit.

## Seed data

`go run ./cmd/seed` inserts **reference data only**: the seven Tashkent
districts and thirteen amenities. It creates no users and no apartments.

It is idempotent through the database, not through a read-then-write check:
`ON CONFLICT (slug) DO NOTHING` means a second run inserts nothing and two
concurrent runs cannot race into a duplicate. Existing rows are never updated,
so a value edited by hand is not silently reverted.

## Environment variables

Copy the template and fill in real values:

```bash
cp .env.example .env
```

`.env` is gitignored and must never be committed.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `8080` | HTTP listen port |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173` | Comma-separated browser origins allowed to call the API |
| `DB_HOST` | no | `localhost` | PostgreSQL host |
| `DB_PORT` | no | `5432` | PostgreSQL port |
| `DB_USER` | **yes** | — | PostgreSQL user |
| `DB_PASSWORD` | no | — | PostgreSQL password |
| `DB_NAME` | **yes** | — | Database name |
| `DB_SSLMODE` | no | `disable` | `disable` locally, `require` in production |
| `JWT_SECRET` | **yes** | — | Signing key for access tokens. Generate with `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | no | `24h` | Access-token lifetime, as a Go duration |

The required variables have no defaults on purpose: startup fails with a list of
what is missing rather than falling back to a guessable value.

## Install dependencies

```bash
go mod download
```

## Run the server

```bash
go run ./cmd/server
```

Or build a binary:

```bash
go build -o bin/server ./cmd/server
./bin/server
```

The server logs the database it connected to and the port it is listening on.
If PostgreSQL is unreachable or the database does not exist, startup fails with
the underlying error instead of continuing without a database.

## Health check

```bash
curl http://localhost:8080/health
```

```json
{ "status": "ok" }
```

This is a liveness probe: it reports that the process is up and does not query
the database.

`GET /api/v1` returns an identifying response. The group exists so feature
routes have somewhere to attach; it has no feature endpoints yet.

## Project layout

```
cmd/server/          entry point: config, database, router, HTTP server
internal/config/     environment configuration and validation
internal/database/   PostgreSQL connection via GORM
internal/middleware/ CORS (Gin supplies logging and recovery)
internal/handler/    HTTP layer      — empty, added per feature
internal/service/    business logic  — empty, added per feature
internal/repository/ database access — empty, added per feature
internal/models/     the ten GORM entities
internal/seed/       reference data (districts, amenities)
migrations/          numbered SQL schema files, embedded into the binary
cmd/migrate/         applies and rolls back migrations
cmd/seed/            inserts reference data
pkg/logger/          stdout/stderr loggers over the standard log package
pkg/response/        shared JSON response envelope
```

Dependencies point one way: handler → service → repository → database. HTTP
concerns stay in handlers, business rules in services, queries in repositories.

## Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | public | Create an account, returns a token |
| POST | `/api/v1/auth/login` | public | Sign in with email **or** phone |
| GET | `/api/v1/auth/me` | Bearer token | The authenticated user |

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"first_name":"Samandar","last_name":"Hodiev","email":"samandar@example.com","phone":"+998901234567","password":"StrongPassword123","language":"uz"}'

curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"samandar@example.com","password":"StrongPassword123"}'

curl http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

Notes on the design:

- Passwords are hashed with **bcrypt at cost 12**. The hash is `json:"-"` on the
  model *and* absent from the response DTO, so it cannot leak through either.
- A failed login always answers `401 Invalid credentials`, whether the account
  is unknown or the password is wrong. An unknown identifier still runs a bcrypt
  hash, so response timing does not reveal which case it was.
- Duplicate email or phone answers `409 User already exists` without saying
  which field collided.
- Tokens are HS256 and carry only `sub`, `iat`, `exp`. The signing algorithm is
  pinned when parsing, so an `alg: none` or HS512 token is rejected.
- The middleware verifies the token and does not hit the database;
  `/auth/me` loads the account itself, so a token for a deleted user fails.
- Phone numbers must be `+998` followed by nine digits. One canonical shape is
  what makes the unique constraint meaningful.
- SQL logging uses `ParameterizedQueries`, so bound values — password hashes
  included — never reach the log.

## Data model

Ten tables, all with UUID primary keys generated by PostgreSQL's
`gen_random_uuid()`.

```
User ──< Apartment >── District
 │         ├──< ApartmentImage
 │         ├──< ApartmentAmenity >── Amenity
 │         ├──< Favorite >── User
 │         └──< Conversation
 │                ├──< ConversationParticipant >── User
 │                └──< Message >── User (sender)
 └──< Favorite, Message, ConversationParticipant
```

There is no role column: a RentHouse user both searches for apartments and
publishes their own, so ownership is `apartments.owner_id`, not a role.

A conversation holds no sender/receiver columns — participants live in
`conversation_participants`, so a thread is not limited to two people.

Delete behaviour is chosen per relationship rather than cascading everywhere:

| Relationship | On delete | Why |
|---|---|---|
| apartment → owner (user) | CASCADE | Deleting an account removes the listings it published |
| apartment → district | RESTRICT | Reference data must not vanish while listings point at it |
| image, favourite, amenity link → apartment | CASCADE | Meaningless without the listing |
| conversation → apartment | CASCADE | See the note below |
| participant, message → conversation | CASCADE | Meaningless without the thread |

## Development checks

```bash
gofmt -l .        # no output means every file is formatted
go vet ./...
go test ./...     # unit tests; needs no database
```

Integration tests exercise the real constraints and therefore need a migrated
database. They are behind a build tag and require an explicit DSN, so they can
never silently skip and report success:

```bash
TEST_DATABASE_DSN="host=localhost port=5432 user=postgres password=postgres dbname=renthouse sslmode=disable" \
  go test -tags=integration ./...
```

Every integration test runs inside a transaction that is rolled back, so the
database is left exactly as it was found.

## Open decisions

- **Deleting an apartment deletes its conversations and their messages.** That
  is what "no orphaned conversations" requires, but it also means chat history
  does not outlive the listing. If it should, `conversations.apartment_id`
  becomes nullable with `ON DELETE SET NULL`.
- **`users` has no soft delete.** Deleting an account cascades to its listings,
  favourites, messages and conversation memberships. If accounts should instead
  be deactivated, that needs a `deleted_at` column and a decision about what
  happens to their live listings.
