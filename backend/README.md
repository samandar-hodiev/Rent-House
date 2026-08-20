# RentHouse Backend

REST API for RentHouse, an apartment rental platform for Tashkent.

Phases complete so far:

1. **Foundation** — configuration, database connection, logging, CORS, health check.
2. **Database architecture** — models, migrations, reference seed data.
3. **Authentication** — OTP-verified registration, login, JWT access tokens,
   protected routes.

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
| `JWT_EXPIRES_IN` | no | `24h` | Access-token lifetime, as a Go duration (`JWT_EXPIRATION` is accepted as an alias) |
| `OTP_EXPIRATION` | no | `5m` | How long a verification code stays valid |
| `OTP_RESEND_COOLDOWN` | no | `60s` | Minimum gap between codes for one contact |
| `OTP_MAX_ATTEMPTS` | no | `5` | Wrong guesses before a code is locked |
| `REGISTRATION_TOKEN_EXPIRATION` | no | `15m` | How long a verified session may take to finish |

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
internal/models/     the GORM entities
internal/dto/        request and response shapes
internal/otp/        one-time code generation, hashing and comparison
internal/notify/     verification-code sender interface + development senders
internal/token/      JWT minting and verification
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

Registration proves the user controls the contact they sign up with. A simple
"post a name, email and password" endpoint would let anyone register any phone
number or address, so there isn't one: an account can only be created by
completing a code sent to that phone or email.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register/request` | public | Send a 6-digit code to a phone **or** email |
| POST | `/api/v1/auth/register/verify` | public | Check the code, return a registration token |
| POST | `/api/v1/auth/register/complete` | public | Exchange the token for an account + JWT |
| POST | `/api/v1/auth/login` | public | Sign in with email **or** phone |
| GET | `/api/v1/auth/me` | Bearer token | The authenticated user |

### Registration flow

```
choose phone or email
        ↓  POST /register/request      -> verification_id  (code goes by SMS/email)
enter the 6-digit code
        ↓  POST /register/verify       -> registration_token (valid 15m)
enter name + password
        ↓  POST /register/complete     -> user + access_token   (201)
already signed in — no separate login step
```

```bash
# 1. request a code (phone)
curl -X POST http://localhost:8080/api/v1/auth/register/request \
  -H 'Content-Type: application/json' \
  -d '{"method":"phone","phone":"+998901234567"}'
# -> {"success":true,"message":"Verification code sent",
#     "data":{"verification_id":"…","method":"phone","expires_in":300,
#             "resend_after":60,"attempts_remaining":5}}

# or by email
curl -X POST http://localhost:8080/api/v1/auth/register/request \
  -H 'Content-Type: application/json' \
  -d '{"method":"email","email":"samandar@example.com"}'

# 2. verify
curl -X POST http://localhost:8080/api/v1/auth/register/verify \
  -H 'Content-Type: application/json' \
  -d '{"verification_id":"…","code":"483921"}'
# -> {"data":{"registration_token":"…","expires_in":900}}

# 3. complete
curl -X POST http://localhost:8080/api/v1/auth/register/complete \
  -H 'Content-Type: application/json' \
  -d '{"registration_token":"…","first_name":"Samandar","last_name":"Hodiev",
       "password":"StrongPassword123","password_confirmation":"StrongPassword123"}'
# -> 201 {"data":{"user":{…},"access_token":"…","token_type":"Bearer","expires_in":86400}}
```

A user registers with **one** contact. Registering by phone leaves `email` null
and vice versa; the database requires at least one of the two.

### Delivering the code

`internal/notify` defines a one-method `Sender` interface. Which implementation
runs is decided by two environment variables, and the server says which on
startup:

```
INFO  EMAIL delivery is DISABLED: codes are written to this log, not sent.
INFO  SMS delivery via eskiz
```

| Variable | Values | Default |
|---|---|---|
| `EMAIL_PROVIDER` | `dev`, `resend` | `dev` |
| `SMS_PROVIDER` | `dev`, `eskiz` | `dev` |

**`dev` sends nothing.** It writes the code to the server log with the
destination masked, which is what makes the flow usable without a provider
account:

```
INFO  [dev sms] verification code for ***4567: 483921
INFO  [dev email] verification code for s***@example.com: 021525
```

Never run `dev` in production — the codes would land in log aggregation.

Selecting a real provider **without its credentials is a startup failure**, not
a fallback to `dev`. A server that believes it is sending codes while only
logging them leaves every registration stuck with no visible cause.

#### Email — Resend

1. Create an account at <https://resend.com>.
2. **Verify a sending domain** under Domains. Until you do, Resend only accepts
   `onboarding@resend.dev` as the sender and only delivers to the address that
   owns the account — enough to test, not enough to register real users.
3. Create an API key under API Keys.
4. Set:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_FROM="RentHouse <no-reply@yourdomain.uz>"
```

#### SMS — Eskiz.uz

Uzbek operators route transactional SMS through local agreements, so an
international gateway is not a shortcut: traffic to +998 without a registered
sender ID is unreliable. Eskiz is the established local option.

What you must arrange before this can work — none of it can be done from code:

1. **An account and contract at <https://eskiz.uz>.** Transactional SMS in
   Uzbekistan requires a contract with a legal entity (yuridik shaxs).
2. **A registered sender ID.** `4546` is Eskiz's shared test sender, usable for
   trying the integration. A production sender name must be registered with the
   operators through Eskiz.
3. **An approved message template.** Eskiz moderates message text. Submit the
   exact wording, including the `{code}` placeholder position, and wait for
   approval — **unapproved text is rejected at send time**, which surfaces here
   as a failed registration, not a silent drop.
4. Set:

```bash
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=...        # the account you sign in to my.eskiz.uz with
ESKIZ_PASSWORD=...
ESKIZ_FROM=4546
ESKIZ_MESSAGE="RentHouse tasdiqlash kodi: {code}"   # must match the approved template
```

Eskiz issues a bearer token from an email/password login rather than a static
API key. The sender fetches one on first use, caches it, and re-authenticates
once if the API rejects it, so an expired token does not surface as a failed
registration.

#### If a provider fails

A rejected send propagates: `POST /auth/register/request` answers `500
internal_error`, the provider's reason goes to the server log, and **no
verification row is left claiming a code was delivered**. The user is never told
a code was sent when it was not.

### Login flow

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"samandar@example.com","password":"StrongPassword123"}'

# the identifier may equally be a phone number, in any shape a user would type
  -d '{"identifier":"+998 90 123 45 67","password":"StrongPassword123"}'
```

### Using the token

```bash
curl http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

### Security notes

- **OTP**: six digits from `crypto/rand`, stored as a bcrypt hash, valid 5
  minutes, five attempts, 60-second resend cooldown. Requesting a new code
  invalidates the previous one, and a code that has been verified once cannot
  be verified again.
- **Registration token**: 256 bits from `crypto/rand`, stored as SHA-256,
  single-use, 15-minute life. It carries the verified contact, so a caller
  cannot verify one number and register another.
- **Passwords**: bcrypt at cost 12. The hash is `json:"-"` on the model *and*
  absent from the response DTO, so it cannot leak through either.
- **Login**: always `401 Invalid credentials`, whether the account is unknown or
  the password is wrong. An unknown identifier still runs a bcrypt hash, so
  response timing does not reveal which case it was.
- **Registration conflicts** answer `409 contact_taken`. This is deliberate
  where login is deliberately vague: the user needs to know to sign in instead,
  and the same fact is already discoverable from the login form.
- **Tokens** are HS256 carrying only `sub`, `iat`, `exp`. The algorithm is
  pinned when parsing, so `alg: none` and HS512 are rejected.
- **The middleware** verifies the token without a database round trip;
  `/auth/me` loads the account itself, so a token for a deleted user fails.
- **Logs** never contain passwords, hashes or JWTs. SQL logging uses
  `ParameterizedQueries`, so bound values stay out too.

### Error codes

Failures carry a stable `error` code alongside the human `message`, so a client
branches on the code rather than on wording:

| Status | `error` | When |
|---|---|---|
| 400 | `validation_failed` | Malformed body or a failed binding rule |
| 400 | `contact_mismatch` | The contact does not match the chosen method |
| 401 | `invalid_credentials` | Wrong password, or no such account |
| 401 | `invalid_registration_token` | Unknown, expired, unverified or spent token |
| 401 | `missing_token` / `malformed_token` / `invalid_token` / `token_expired` | Authorization header problems |
| 404 | `verification_not_found` | Unknown, superseded or already-verified code |
| 409 | `contact_taken` | The phone or email is already registered |
| 422 | `invalid_code` / `code_expired` | Wrong or expired OTP |
| 429 | `resend_too_soon` / `too_many_attempts` | Rate limits |
| 500 | `internal_error` | Anything unexpected; detail goes to the log |

### Password reset

Not implemented. The verification table carries a `purpose` column with a
`password_reset` value already allowed, and `user_id` is nullable, so the same
OTP infrastructure — expiry, attempts, cooldown, sender abstraction — is
reusable when that phase arrives.

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
