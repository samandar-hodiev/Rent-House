# File guide

What every file in this repository is for — one entry per file, grouped by
directory. This complements [`PROJECT_ARCHITECTURE.md`](../PROJECT_ARCHITECTURE.md)
(a higher-level, but currently outdated, overview written early in the
project) and [`CLAUDE.md`](../CLAUDE.md) (the product/convention rules). See
[`project-structure.md`](./project-structure.md) for the directory tree on
its own, and [`file-guide.uz.md`](./file-guide.uz.md) for this same guide in
Uzbek.

Layering, backend: **Router (`cmd/server/main.go`) → Handler → Service →
Repository → PostgreSQL.** A handler binds a request and formats a response;
a service holds every rule about who may do what; a repository only runs
queries. Frontend: pages own state and compose components; components render;
`context/` holds cross-page client state; `services/` is the only code that
calls the API; `hooks/` and `utils/` are shared logic with no UI of their
own.

---

## Backend (`backend/`)

### `cmd/` — the four things you can actually run

| File | What it does |
|---|---|
| `cmd/server/main.go` | The API itself. Loads config, connects to the database, wires every handler/service/repository together, registers every route, and starts listening. Everything the server does starts here. |
| `cmd/migrate/main.go` | Applies or rolls back schema changes (`go run ./cmd/migrate up\|status\|down --confirm`). A separate binary from the server on purpose — a schema change is a deliberate step, not something that happens because a process restarted. |
| `cmd/seed/main.go` | Inserts reference data — districts and amenities — into an empty database. Safe to run repeatedly; creates no users, no apartments. |
| `cmd/admin/main.go` | Creates the first owner account on a fresh database. The only way an owner is ever created — there is deliberately no HTTP endpoint for it, so it can't be a door left open twice. |

### `internal/config/` — reading the environment

| File | What it does |
|---|---|
| `config.go` | Loads every setting the server needs from environment variables — database, JWT, rate limits, OTP policy, email/SMS provider, upload paths, trusted proxies — and fails loudly at startup if something required is missing or unsafe (a weak `JWT_SECRET`, a non-positive rate limit). Nothing here has a default for a secret. |
| `config_test.go` | Unit tests for `validate()` — rejects a too-short or placeholder JWT secret, a non-positive rate-limit pair, a bad OTP policy. |

### `internal/database/` — the PostgreSQL connection and migration runner

| File | What it does |
|---|---|
| `database.go` | Opens the PostgreSQL connection via GORM and verifies it with a ping (GORM's `Open` is lazy and won't otherwise catch a wrong host/password at startup). Configures GORM's logger to never write bound parameter values into the log. |
| `migrate.go` | The actual migration engine: loads the embedded `.up.sql`/`.down.sql` pairs, tracks which versions have run in a `schema_migrations` ledger table, and applies or rolls back one at a time, each inside its own transaction. |
| `migrate_test.go` | Unit tests for pairing/ordering migration files. |
| `constraints_integration_test.go` | Integration tests that exercise real database CHECK/UNIQUE constraints directly (not through the application layer) to confirm the schema itself enforces what it claims to. |

### `internal/dto/` — request/response shapes

Every request is bound into one of these, never straight into a database
model — that would let a client set fields it has no business setting, like
`password_hash` or `id`. Every response is built explicitly from one too.

| File | What it does |
|---|---|
| `auth.go` | Registration (3 steps), login, password reset, and the `/auth/me` response shapes. |
| `apartment.go` | The listing create/edit request (`ApartmentWriteRequest`), the search query (`ApartmentListQuery`), and the listing response shape. |
| `chat.go` | Starting a conversation, sending/editing/deleting messages, bulk delete. |
| `admin.go` | Admin login, creating an administrator, changing a listing's or a user's status, the sidebar config, the settings payload. |
| `analytics.go` | The view-count timeline shapes (`DayPoint`/`WeekPoint`/`MonthPoint`) the dashboard chart draws from. |
| `dashboard.go` | The signed-in user's dashboard first-paint response: saved listings plus counters. |
| `notification.go` | One notification as the API returns it — a type and a data payload, not a pre-rendered sentence, so the client renders it in whichever language the reader chose. |
| `report.go` | A complaint about a listing, as raised, as shown on the admin table, and as shown in the reporter's own history. |
| `validation.go` | Uzbek phone number normalization/validation (`+998...`) and registering a custom Gin validator tag for it. |
| `auth_test.go` | Unit tests for the auth DTOs' normalization logic. |

### `internal/handler/` — HTTP layer (bind, delegate, respond)

No business rules and no database access live here — only binding a request,
calling a service, and mapping the result onto a status code.

| File | What it does |
|---|---|
| `auth_handler.go` | Registration, login, refresh, logout, profile update, password reset endpoints. |
| `apartment_handler.go` | Create/list/get/update/delete a listing, the owner's own listing list and stats. |
| `admin_handler.go` | Every admin-dashboard endpoint: login, profile, users, listings, admins, sidebar, settings, roles/permissions, dashboard stats. |
| `chat_handler.go` | Start a conversation, list conversations, list/send messages (text or file). |
| `block_handler.go` | Block/unblock a user, list who you've blocked. |
| `favorite_handler.go` | Save/unsave a listing, list saved listings, the dashboard summary. |
| `notification_handler.go` | Both notification feeds (marketplace and admin) — one handler, since they're the same shape and the recipient comes from whichever token the route requires. |
| `report_handler.go` | Report a listing, an account's own report history, the admin's report list and status updates. |
| `analytics_handler.go` | The owner's view-count timeline and one listing's own timeline. |
| `settings_handler.go` | The public, read-only slice of site configuration a visitor's browser needs before signing in (site name, default language, maintenance flag). |
| `upload_handler.go` | Stores an uploaded listing photograph and hands back its URL. |
| `ws_handler.go` | Upgrades a request to a WebSocket connection for the realtime chat channel. |
| `validation_message_test.go` | Unit test (no DB) for the helper that turns a raw Gin binding error, or a body-too-large error, into a client-safe message. |
| `account_deletion_integration_test.go` | A deleted account can't be deleted again; the row is anonymized, not removed. |
| `admin_create_integration_test.go` | Only the owner may create an administrator — enforced at the API, not just hidden in the UI. |
| `admin_handler.go`'s tests: `admin_login_lockout_integration_test.go` | The admin login lockout counts and locks correctly, and is namespaced apart from marketplace login lockouts. |
| `admin_profile_integration_test.go` | An admin's avatar must be one this server actually stored — the host-spoofing fix, tested directly. |
| `admin_session_integration_test.go` | Suspending an administrator ends their open dashboard sessions, not just their next sign-in. |
| `analytics_integration_test.go` | The view counter on a listing card and the analytics chart must never disagree — both are written in one transaction. |
| `apartment_filters_integration_test.go` | Search/filter query parameters actually narrow the result set the way they claim to. |
| `apartment_integration_test.go` | Ownership rules on listings: a client can't nominate an owner, a draft is invisible to everyone but its author. |
| `auth_integration_test.go` | The full registration → login → refresh flow, end to end, against a real database. |
| `block_integration_test.go` | Blocking hides a thread from only the blocker's own list; a missing reason still produces a usable row. |
| `chat_grouping_integration_test.go` | Two people have one conversation however many listings they discuss — the grouping/role-swap rules. |
| `chat_settings_integration_test.go` | The attachment size/type limits the client is told about are the ones the server actually enforces. |
| `conversation_state_integration_test.go` | Pin/archive/delete-for-me/reopen behavior of a conversation. |
| `dashboard_integration_test.go` | The dashboard's first-paint summary endpoint. |
| `listing_status_integration_test.go` | Listing lifecycle transitions — only the ones the interface offers are ever accepted, and "delete" is soft. |
| `login_lockout_integration_test.go` | The marketplace login lockout mechanism (shared table, different namespace from the admin one). |
| `message_actions_integration_test.go` | Reply, withdraw, and bulk-delete rules for chat messages. |
| `my_reports_integration_test.go` | A reporter's own history shows the resolution and nothing about anyone else's reports. |
| `notification_integration_test.go` | Turning a notification type off leaves no row at all; feeds don't cross between accounts. |
| `password_reset_integration_test.go` | A reset link works once, requesting a new one invalidates the old, and the endpoint never reveals whether an address is registered. |
| `profile_integration_test.go` | Profile edits: omitted fields survive, a phone can't be taken from another account or cleared when it's the only contact. |
| `ratelimit_integration_test.go` | The IP-based rate limiter itself, wired the same way `cmd/server` wires it. |
| `report_integration_test.go` | Fixture builder shared by the report-related tests. |
| `session_integration_test.go` | Refresh-token session mechanics for marketplace accounts. |
| `settings_enforcement_integration_test.go` | A setting the owner changes (moderation, image limits) actually changes what a write does. |

### `internal/middleware/` — shared Gin middleware

| File | What it does |
|---|---|
| `auth.go` | `Auth` (reject anyone without a valid token), `OptionalAuth` (identify if present, allow anonymous otherwise), `QueryAuth` (token from a query string, for `<img>`/`<a>` URLs that can't set a header). |
| `admin.go` | `AdminAuth` (dashboard-scoped token check), `RequireOwner` (only the owner may pass), `RequireSection` (only if the owner hasn't switched this dashboard section off). |
| `cors.go` | Allows browser requests only from the configured origins, reflecting the request's own origin rather than answering `*` (a wildcard can't be combined with credentials). |
| `maintenance.go` | Closes the marketplace to everyone but administrators when maintenance mode is on — enforced at the API, not only hidden in the UI. |
| `ratelimit.go` | The in-memory, per-IP sliding-window rate limiter every public, account-less endpoint uses (register, login, password reset, listing creation, uploads). |
| `request_limits.go` | Caps how much of a request body the server will read at all, regardless of what the handler does with the rest. |
| `security_headers.go` | Sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on every response — no CSP, deliberately (see the comment for why). |
| `auth_test.go` | Unit tests for `Auth`/`OptionalAuth`/`QueryAuth`. |
| `cors_test.go` | Unit tests for the origin allow-list logic. |
| `ratelimit_test.go` | Unit tests for the rate limiter (window expiry, per-key isolation). |
| `request_limits_test.go` | Unit tests for the body-size cap. |
| `security_headers_test.go` | Unit tests confirming every header is set on every response. |

### `internal/models/` — the GORM entities

These describe the schema for the application; they don't create it (the SQL
files in `migrations/` do that, and the two are kept in step by hand).

| File | What it does |
|---|---|
| `models.go` | The `Base` (UUID primary key) and `Timestamps` (`created_at`/`updated_at`) structs every entity embeds. |
| `user.go` | A marketplace account. No role column — ownership of a listing is what makes someone an "owner", not a flag. |
| `admin.go` | A dashboard account — deliberately its own table, never a `users` row with a role. |
| `apartment.go` | A rental listing: price (as a `decimal`, never a float), location, specs, status, apartment type. |
| `apartment_image.go` | One photo of a listing, its own row so photos can be ordered/counted/replaced individually. |
| `apartment_amenity.go` | The join table between apartments and amenities. |
| `apartment_view.go` | One counted view of a listing — the analytics record behind `apartments.views_count`. |
| `amenity.go` | Reference data: a feature an apartment can offer (wifi, parking, ...). |
| `district.go` | Reference data: the Tashkent districts an apartment can sit in. |
| `favorite.go` | A saved (wishlisted) apartment. |
| `conversation.go` | The correspondence between two people — identified by the pair, not by a listing. |
| `conversation_participant.go` | One person's membership in, and opinion of (pinned/archived/deleted-for-them), a conversation. |
| `message.go` | One chat message. Withdrawing is a soft delete — the row stays so the thread keeps its shape. |
| `message_attachment.go` | A file sent in a conversation; the bytes live in storage, this records where. |
| `message_deletion.go` | "Delete for me" — hides one message from one participant without touching the other's copy. |
| `user_block.go` | One person refusing to hear from another — stored one-directional, effective both ways. |
| `admin_user_block.go` | One occasion an administrator blocked a marketplace account (the history behind `users.status`). |
| `admin_audit_log.go` | One thing an administrator did — signed in, blocked someone, changed a setting. |
| `admin_refresh_token.go` | The admin dashboard's half of a session, mirroring `refresh_token.go`. |
| `refresh_token.go` | The server's half of a marketplace user's session — what makes "sign out" actually mean something. |
| `auth_verification.go` | One OTP verification attempt: the hashed code, attempt count, and the short-lived token issued once it's correct. |
| `listing_report.go` | One complaint about one listing. |
| `notification.go` | One thing somebody should know about — shared shape for both the marketplace and the admin feed. |
| `site_setting.go` | The typed declaration of every configurable site setting (key, type, category, default, min/max) — the registry `internal/service/settings_service.go` reads against. |
| `json_map.go` | A `jsonb` column read as a Go map — the `Value`/`Scan` glue GORM needs to do that. |
| `models_test.go` | Sanity tests for the shared embedded types. |

### `internal/notify/` — sending verification codes, emails, SMS

| File | What it does |
|---|---|
| `sender.go` | The `Sender` interface everything else implements, plus `DevelopmentSMSSender` (logs instead of sending, for local dev). |
| `factory.go` | Picks and configures the actual provider from environment config — refuses to silently fall back to a fake sender if misconfigured. |
| `resend.go` | Sends verification-code and password-reset emails through the Resend API. |
| `smtp.go` | Sends the same two kinds of email through a plain SMTP server (an alternative to Resend). |
| `eskiz.go` | Sends verification-code SMS through Eskiz.uz (Uzbek carriers route transactional SMS through local agreements — not yet wired up as of this writing; see `CLAUDE.md`). |
| `email_template.go` | Renders the actual HTML/plain-text bodies for the two email kinds, with the code/link HTML-escaped. |
| `provider_test.go`, `sender_test.go`, `smtp_test.go` | Unit tests confirming each provider sends to the right recipient, logs safely (no code/secret in the log), and surfaces a rejection as an error rather than swallowing it. |

### `internal/otp/` — one-time codes

| File | What it does |
|---|---|
| `otp.go` | Generates a cryptographically random 6-digit code, hashes it for storage, and checks a submitted code against the hash in constant time. |
| `otp_test.go` | Unit tests for the above. |

### `internal/realtime/` — the WebSocket chat channel

| File | What it does |
|---|---|
| `hub.go` | Tracks which users have a live connection open (a user can have several — two tabs, a phone) and reports presence changes. Stores no messages itself. |
| `socket.go` | Adapts a real `gorilla/websocket` connection to the hub's `Connection` interface — serializes writes through one goroutine per socket, since a WebSocket allows only one writer at a time. |

### `internal/repository/` — database access only

No business rules live here — no ownership checks, no status transitions,
only queries.

| File | What it does |
|---|---|
| `apartment_repository.go` | Reads and writes listings, their images, and their amenity links. |
| `admin_listing_repository.go` | Read-only listing queries for the admin dashboard's table and detail view. |
| `admin_repository.go` | Reads/writes admin accounts and the sidebar visibility configuration. |
| `admin_refresh_token_repository.go` | Admin session storage — mirrors `refresh_token_repository.go`. |
| `admin_stats_repository.go` | The counts and growth-series queries behind the admin dashboard's headline figures and charts. |
| `analytics_repository.go` | Records a view event (with dedup logic) and aggregates view counts by day/week/month. |
| `block_repository.go` | Who has blocked whom, and the query the chat send-path checks before allowing a message. |
| `chat_repository.go` | Conversations and messages — finding or creating a thread, loading a page of messages. |
| `favorite_repository.go` | Saved listings — add, remove, count, list. |
| `login_attempt_repository.go` | The shared failed-sign-in counter and lockout table both marketplace and admin login use (namespaced apart). |
| `notification_repository.go` | Stores and lists notifications, and who should receive one (fanning an event out to every active admin). |
| `refresh_token_repository.go` | Marketplace user session storage — create, find, rotate (single-use), revoke. |
| `report_repository.go` | Complaints about listings — create, count-open-for-a-listing, the admin's paged list. |
| `settings_repository.go` | Raw key/value reads and writes for site configuration. |
| `user_repository.go` | Reads and writes marketplace accounts. |
| `verification_repository.go` | OTP verification rows — the registration/password-reset code lifecycle. |
| `repository_integration_test.go` | Cross-cutting integration tests (session rotation single-use guarantee, duplicate-complaint rejection) that don't belong to one repository alone. |

### `internal/seed/` — reference-data seeding logic

| File | What it does |
|---|---|
| `seed.go` | Inserts districts and amenities if missing, leaves existing rows untouched — the logic `cmd/seed` calls. |
| `seed_test.go` | Confirms every amenity slug the frontend can send is actually seeded. |

### `internal/service/` — business rules

Handlers deal in HTTP, repositories deal in SQL; every rule about who may do
what lives here.

| File | What it does |
|---|---|
| `auth_service.go` | Registration, login, password reset, profile updates, account deletion — the marketplace's whole identity story. |
| `apartment_service.go` | Who may create/edit/view a listing, which fields are allowed, when it becomes publicly visible, cleaning up dropped gallery photos on edit. |
| `admin_service.go` | Admin login (with lockout), creating/suspending administrators, the owner-only checks. |
| `admin_listing_service.go` | Admin-side listing moderation: status transitions, the detail view. |
| `admin_stats_service.go` | Turns raw database counts into the gap-filled time series the dashboard charts draw. |
| `analytics_service.go` | Records a view (deduplicated per visitor per hour) and builds an owner's view timeline. |
| `chat_service.go` | Who may read/send in a thread, message edit/withdraw rules, broadcasting to the realtime hub after a DB write succeeds. |
| `favorite_service.go` | Save/unsave a listing, the dashboard's saved-listings summary. |
| `listing_expiry.go` | The background sweep that closes listings published longer than the marketplace allows (off by default). |
| `notification_service.go` | Writes and reads what people should be told about; checks whether a notification kind is switched on before writing anything. |
| `password.go` | The one password-strength rule every password on the system (registration, reset, admin creation) is checked against. |
| `report_service.go` | Who may report a listing, and sending a listing back for moderation once enough reports land on it. |
| `settings_service.go` | Parses stored key/value settings into a typed `Settings` struct; falls back to declared defaults if a stored value is missing or malformed. |
| `settings_registry_test.go` | Confirms the `Settings` struct and the setting-key registry describe exactly the same fields (a mismatch would silently drop a setting). |
| `apartment_image_cleanup_integration_test.go` | Confirms editing a listing's gallery deletes the dropped photo files from disk, not just their database rows. |
| `settings_integration_test.go` | Confirms a setting the owner changes (moderation on/off, image count limits) actually changes what a write is allowed to do. |
| `password_test.go` | Unit test for the password policy. |

### `internal/storage/` — where uploaded files go

| File | What it does |
|---|---|
| `storage.go` | The `Storage` interface and its one implementation, `LocalStorage` (writes to a directory on disk, served as static files) — an interface so a future S3/R2 backend is a new type, not a rewrite. |
| `kinds.go` | The three upload categories (image/file/audio), their accepted MIME types → extensions, and size ceilings. |
| `storage_test.go` | Confirms uploads are validated by actual file content (magic bytes), not just the claimed `Content-Type`. |

### `internal/token/` — JWTs

| File | What it does |
|---|---|
| `token.go` | Mints and verifies signed access tokens, scoped to an audience (`renthouse:user` vs `renthouse:admin`) so one can never be presented where the other is required. |
| `token_test.go` | Unit tests for token minting/verification/expiry. |

### `migrations/` — the schema, one reviewable step at a time

`migrations.go` embeds every `.sql` file below into the binary via `go:embed`
so the server never needs the files on disk at runtime. Each numbered pair
(`.up.sql` / `.down.sql`) is one schema change, applied and reversed as a
unit.

| Migration | What it changed |
|---|---|
| `0001_init` | The initial schema: users, districts, apartments, apartment images, amenities, favorites, conversations, messages. |
| `0002_auth_verifications` | Phone-OR-email registration, and the OTP verification table. |
| `0003_apartment_listing_details` | The owner-form fields `0001` had nowhere to put: deposit, utilities, minimum term, house rules, neighbourhood. |
| `0004_chat` | What a real conversation needs beyond the `0001` placeholder: who started it, edited-at, withdrawn-at, read receipts. |
| `0005_message_attachments` | Pictures, documents and voice notes in chat (messages stop being text-only). |
| `0006_apartment_views` | Real, timestamped view events, replacing the bare `views_count` increment. |
| `0007_reconcile_views_count` | One-time backfill making the `views_count` counter agree with the `apartment_views` event history for rows predating `0006`. |
| `0008_conversation_state` | Pin/archive/delete-for-me as per-participant state, not facts about the thread. |
| `0009_direct_conversations` | Redefines a conversation's identity as a pair of people, not a (listing, buyer) pair — one thread however many listings they discuss. |
| `0010_conversation_hidden_cleared` | Separates "this thread left my list" from "these older messages are no longer mine to read", so reopening a withdrawn thread doesn't destroy history. |
| `0011_user_blocks` | One person refusing to hear from another. |
| `0012_normalize_conversation_pair` | Makes the conversation pair unordered, so the same two people don't get a second thread when who's "buyer" and who's "owner" swaps. |
| `0013_message_replies` | A message can point at the message it answers. |
| `0014_apartment_deleted_status` | "Delete" becomes a status, not a row removal — everything that referenced the listing keeps working. |
| `0015_verification_token_rename` | Renames a column so password-reset can reuse the same token mechanism registration already had. |
| `0016_admins` | The `admins` table — dashboard accounts, kept structurally apart from `users`. |
| `0017_admin_users` | Adds `users.status` (blocked/active) and the admin account's own status field. |
| `0018_user_block_reasons` | A history table for why/when/by-whom a marketplace account was blocked. |
| `0019_message_delete_audit` | Preserves a withdrawn message's original text and who withdrew it, for moderation. |
| `0020_admin_audit_logs` | The table behind the previously-mocked admin audit log page. |
| `0021_site_settings` | The first version of the owner-configurable site settings table. |
| `0022_site_settings_registry` | Grows that table into the full configuration registry (typed values, categories, who last changed what). |
| `0023_login_attempts` | The failed-sign-in counter that makes "maximum login attempts" / "lock duration" settings actually do something. |
| `0024_refresh_tokens` | Gives marketplace sessions a server-side half, so sign-out (and forced sign-out) actually work. |
| `0025_listing_reports` | The table behind the previously-mocked "complaints" admin section. |
| `0026_notifications` | The shared notification table for both the marketplace and admin feeds. |
| `0027_admin_refresh_tokens` | The same session mechanism as `0024`, for admin accounts. |
| `0028_user_account_deletion` | Lets a marketplace account delete (anonymize) itself without breaking everything that references it. |
| `0029_apartment_type` | Adds `apartment_type` (apartment/house/room) — a field CLAUDE.md always specified but that was never built. |

### `pkg/` — small, dependency-free shared packages

| File | What it does |
|---|---|
| `pkg/logger/logger.go` | The application's `Infof`/`Errorf`/`Fatalf` — a thin wrapper over the standard library's `log` package, no external logging dependency. |
| `pkg/response/response.go` | The one JSON envelope shape (`{success, message, data, error}`) every handler responds with. |

---

## Frontend (`frontend/src/`)

### Root files

| File | What it does |
|---|---|
| `main.jsx` | The actual React DOM render entry point. |
| `App.jsx` | The full route table and the provider tree (auth, locale, theme, search, wishlist, chat, ...) every page renders inside. Also the maintenance-mode gate. |
| `index.css` | Tailwind import, the design-token theme (colors, fonts), and global base styles. |

### `components/` — top-level shared UI

| File | What it does |
|---|---|
| `ApartmentCard.jsx` | The card used everywhere a listing is shown as a list item — image, price, title, district, specs, wishlist heart, "view on map" link. |
| `ApartmentCardSkeleton.jsx` | Loading placeholder shaped like `ApartmentCard`. |
| `ApartmentDetailsSkeleton.jsx` | Loading placeholder for the apartment detail page. |
| `ApartmentGrid.jsx` | Lays out a list of `ApartmentCard`s responsively. |
| `ApartmentMap.jsx` | The Yandex Maps wrapper used on the Map page — markers, district boundary highlight, user-location dot. |
| `AuthCard.jsx` | The translucent card surface every auth screen is drawn on. |
| `AuthedHeaderActions.jsx` | The header's right side once signed in — avatar, notifications, chat icon. |
| `ContactChatModal.jsx` | The "Xabar yozish" modal opened from a listing — opens (or reopens) the real conversation with the owner. |
| `Container.jsx` | The page's max-width content wrapper, with the breakpoint tuned to fit exactly five apartment cards per row on a large desktop. |
| `DeleteAccountDialog.jsx` | Confirms account deletion, asking for the current password as proof of intent. |
| `DistrictSelector.jsx` | The searchable district popover used in the search bar and filters — not a native `<select>`. |
| `EmptyState.jsx` | The shared "nothing here" block (icon, title, description, optional action button) used across empty and error states site-wide. |
| `FilterBar.jsx` | The "Filtrlar" button + active-filter chips row; opens `FilterPanel` as a dropdown (desktop) or bottom sheet (mobile). |
| `FilterPanel.jsx` | The actual filter fields: price, rooms, area, floor, apartment type, furnished. |
| `Footer.jsx` | The site footer. |
| `FormField.jsx` | The shared labeled text input (with password-reveal support) used across auth, profile and listing forms. |
| `Header.jsx` | The site header — logo, district/keyword search, language, theme, auth state. |
| `ImageGallery.jsx` | A listing's photo gallery on the detail page. |
| `ImageLightbox.jsx` | Full-size photo viewer, opened from a thumbnail. |
| `LanguageSelector.jsx` | The uz/ru/en switcher. |
| `LogoutDialog.jsx` | Confirms signing out. |
| `MapApartmentPreview.jsx` | The floating (desktop) / bottom-sheet (mobile) card shown when a map marker is clicked. |
| `MapControls.jsx` | Zoom and locate-me buttons on the Map page. |
| `MapLayerSelector.jsx` | Street/satellite/traffic layer switcher on the Map page. |
| `NoPhoneDialog.jsx` | Shown instead of dialing when an owner hasn't added a phone number — offers chat instead. |
| `Pagination.jsx` | Page-number controls for a server-paginated list, reading/writing the page number to the URL. |
| `ReportListingDialog.jsx` | The "report this listing" form — reason picklist plus free text. |
| `RequireAuth.jsx` | Route guard for the signed-in-only part of the marketplace (dashboard, wishlist, ...). |
| `SearchBar.jsx` | The header's district + keyword search control. |
| `SortDropdown.jsx` | The "Saralash" sort-order dropdown on search results. |
| `ThemeToggle.jsx` | Light/dark switch. |
| `headerMenuStyles.js` | Shared Tailwind classes for the mobile header dropdown menu, factored out so `Header.jsx` and the signed-in actions menu don't need to import each other. |

### `components/admin/` — admin-dashboard-only UI

| File | What it does |
|---|---|
| `AdminChart.jsx` | `LineChart` (hand-drawn SVG, no charting library) and `BarList` — the two chart primitives every admin analytics view uses. |
| `AdminConfirmDialog.jsx` | The dashboard's one confirmation dialog, reused for every "are you sure" (sign out, block, remove an admin). |
| `AdminLayout.jsx` | The admin shell: fixed nav column + header + page outlet, and the top-level route wrapper (`AdminRoot`) that gives even the login page the admin theme/locale. |
| `AdminSidebar.jsx` | The nav itself — `ADMIN_NAV` (every entry, in order), `CONFIGURABLE_NAV` (the subset the owner can toggle per super admin), and `isNavVisible` (the visibility rule). |
| `AdminSidebar.test.jsx` | Confirms owner-only sections stay hidden from a super admin regardless of the stored sidebar config. |
| `AvatarDialog.jsx` | Full-size view of an account's avatar. |
| `ConversationAudit.jsx` | Read-only view of every conversation about one owner's listings, for the listing detail page's audit card — owner-only. |
| `ListingGalleryDialog.jsx` | Carousel viewer for a listing's photos, opened from the admin listing detail/table. |
| `RequireAdmin.jsx` | Route guard in front of every dashboard page (a convenience — the API enforces the real check). |
| `adminUi.jsx` | Small shared primitives: `AdminCard`, `StatCard`, `AdminTable` (horizontally scrolling), `ViewLink`, `Switch`, `MockButton`. |

### `components/auth/` — registration/login screen pieces

| File | What it does |
|---|---|
| `AuthAlert.jsx` | Inline error/success banner for auth forms. |
| `AuthBackground.jsx` | The decorative animated background behind every auth screen. |
| `AuthBrand.jsx` | The logo/wordmark shown above the auth card. |
| `AuthButton.jsx` | The primary submit button style shared by every auth form. |
| `AuthCard.jsx` | (see `components/AuthCard.jsx` — re-exported/duplicated shell here for the auth folder's own composition) |
| `AuthFooterLink.jsx` | The "Don't have an account? / Ro'yxatdan o'tish" link under a form. |
| `AuthInput.jsx` | The text input styled specifically for auth screens (kept separate from the shared `FormField` so restyling one never touches the dashboard's forms). |
| `AuthLayout.jsx` | The full-screen shell (no header/footer) every auth page renders inside. |
| `AuthProgress.jsx` | The step indicator for the 3-step registration flow. |
| `MethodChoice.jsx` | Phone-vs-email picker on the register/login forms — the phone option is currently disabled pending Eskiz SMS integration. |
| `OtpInput.jsx` | The 6-digit code entry control. |

### `components/chat/` — the chat feature's UI

| File | What it does |
|---|---|
| `ApartmentContextBar.jsx` | The small listing-context strip shown inline in a thread when a message is "about" that listing. |
| `BlockUserDialog.jsx` | Confirms blocking someone, with an optional reason. |
| `ChatComposer.jsx` | The message input row: text, one attachment, or a voice note. |
| `ChatConversationList.jsx` | The list of threads in the sidebar, most-recently-active first, pinned ones on top. |
| `ChatHeaderMenu.jsx` | The open-thread header's actions menu (block/archive/delete). |
| `ChatMessage.jsx` | One message bubble. |
| `ChatSettingsMenu.jsx` | Archive and blocked-users links at the foot of the chat sidebar. |
| `ChatThread.jsx` | The open conversation: message list, composer, pagination, realtime updates. |
| `ConversationDialogs.jsx` | `ArchiveConversationDialog` and `DeleteConversationDialog` — shared confirmation shell for both. |
| `ConversationMenu.jsx` | Per-row actions menu on a conversation-list entry. |
| `DeleteMessageDialog.jsx` | Confirms how to remove a message — hide for me vs. withdraw for everyone. |
| `MessageActionsMenu.jsx` | Reply / Select / Edit / Delete, behind one button on a message bubble. |
| `MessageAttachment.jsx` | Renders an image/file/voice-note attachment inside a bubble; `VoiceNote` is the audio player. |
| `MessageNotifications.jsx` | New-message alerts — an in-app toast when the tab is focused, a browser notification when it isn't. |
| `MessageQuote.jsx` | The quoted-message preview shown above a reply, both in a bubble and while composing one. |
| `UnblockDialog.jsx` | Confirms lifting a block. |

### `components/dashboard/` — signed-in user dashboard pieces

| File | What it does |
|---|---|
| `DashboardHeader.jsx` | The dashboard's own header bar. |
| `DashboardLayout.jsx` | Sidebar + header + page outlet shell for every `/dashboard/*` route. |
| `DashboardListingStatusNav.jsx` | The expandable "E'lonlar holati" nav group (all/active/pending/closed/drafts/deleted). |
| `DashboardMobileMenu.jsx` | Mobile drawer version of the dashboard nav. |
| `DashboardNavItem.jsx` | One sidebar nav row. |
| `DashboardNotifications.jsx` | Small "what happened to your listings" list on the dashboard overview. |
| `DashboardOverview.jsx` | The dashboard landing page: headline counters plus the views chart. |
| `DashboardSettingsMenu.jsx` | Theme/language menu at the foot of the dashboard sidebar. |
| `DashboardSidebar.jsx` | The fixed nav column. |
| `ListingGalleryModal.jsx` | Photo viewer for one of the signed-in user's own listings. |
| `ListingStatusDialog.jsx` | Confirms a listing status change (publish/close/delete/...). |
| `ListingStatusMenu.jsx` | The menu offering only the transitions the server would actually accept for a listing's current state. |
| `MyListingCard.jsx` | One row of the owner's own listings table/grid — thumbnail, status badge, actions. |
| `UserAvatar.jsx` | Picture-or-initials avatar, used everywhere an account's identity is shown. |
| `ViewsChart.jsx` | The line chart on the dashboard overview and the per-listing analytics view. |

### `components/listing/` — the create/edit-listing form's pieces

| File | What it does |
|---|---|
| `CheckboxGroup.jsx` | Multi-select checkbox row (amenities, house rules). |
| `FormSection.jsx` | Titled card wrapper — one per group of fields in the listing form. |
| `ImageUploader.jsx` | Drag/select-to-upload gallery editor with per-image retry-on-failure. |
| `ListingLocationPicker.jsx` | The click-to-place map for setting a listing's coordinates. |
| `ListingPreview.jsx` | Live "here's how your card will look" preview beside the form. |
| `SegmentedField.jsx` | The pill-button single-choice control (currency, furnished, rental period, apartment type). |
| `SelectField.jsx` | Native `<select>`-styled dropdown (used where a segmented row would be too wide — districts). |
| `TextAreaField.jsx` | Labeled multi-line text input with a character counter. |

### `context/` — cross-page client state (React Context)

| File | What it does |
|---|---|
| `AdminAuthContext.jsx` | The signed-in administrator's session — re-validated against the API on every load. |
| `AdminLogoutContext.jsx` | The one admin sign-out confirmation, shared by the header menu and the sidebar's own logout link. |
| `AdminSettingsContext.jsx` | The admin dashboard's own theme/language and the sidebar visibility config (`ADMIN_ROLE`, `DEFAULT_SIDEBAR`). |
| `AuthContext.jsx` | The signed-in marketplace user's session and profile. |
| `ChatContext.jsx` | The single WebSocket connection for the whole session, the conversation list, and the unread badge. |
| `ListingsContext.jsx` | The signed-in owner's own listings (dashboard list, stats). |
| `LocaleContext.jsx` | The active uz/ru/en language and the `t()` translation lookup. |
| `LocaleContext.test.jsx` | Unit tests for which language wins on load (stored choice vs. site default). |
| `SearchContext.jsx` | The shared district/keyword/filter state behind Home, Search and Map. |
| `SiteSettingsContext.jsx` | The public site configuration (name, default language, maintenance flag) fetched once for every visitor. |
| `ThemeContext.jsx` | Light/dark theme state for the public site. |
| `ToastContext.jsx` | Short confirmation toasts ("Saqlandi", ...) — distinct from chat's own message notifications. |
| `WishlistContext.jsx` | The signed-in user's saved-apartment ids and count, backed by the `favorites` table. |

### `data/` — static reference data and shape/validation definitions

| File | What it does |
|---|---|
| `districtBoundaries.js` | Loads/normalizes the raw GeoJSON below for the app to consume. |
| `districts.geo.json` | The raw GeoJSON itself — real Tashkent district polygon boundaries sourced from OpenStreetMap. |
| `districts.js` | The flat id+name district list used by pickers, filter chips and cards — single source of truth so no district name is ever duplicated. |
| `listingForm.js` | The listing form's field definitions, options (furnishing, apartment type, currencies, ...), and the blank-form/validation logic. |
| `listingStatus.js` | The listing lifecycle vocabulary, matching exactly what PostgreSQL's CHECK constraint accepts — no second, translated vocabulary to keep in step. |
| `mapLayers.js` | The base map styles (street/satellite/traffic) the Map page's layer switcher offers. |

### `hooks/` — shared logic with no UI of its own

| File | What it does |
|---|---|
| `useConversation.js` | Everything one open chat thread needs: messages, pagination, realtime updates, send/edit/delete. |
| `useDashboardSummary.js` | Fetches the dashboard's counters + short lists, refetching when the tab regains focus. |
| `useDismiss.js` | Closes a popover/menu on an outside click or Escape. |
| `useGeolocation.js` | Wraps the browser geolocation API with a consistent status/error vocabulary, shared by the Map page and the listing location picker. |
| `useMediaQuery.js` | A CSS media query as a boolean, reactively. |
| `useMessageSound.js` | Plays a short tone on an incoming chat message. |
| `useModalDialog.js` | The two things every dialog needs: focus on open, Escape to close. |
| `useRequireAuth.js` | Wraps a click handler so an unauthenticated user is sent to sign in first, then returned. |
| `useSiteFormat.js` | Date/time formatting per the site's configured format and clock style. |
| `useSiteLocation.js` | The configured city name ("Toshkent"), read once rather than hardcoded per screen. |
| `useViewsAnalytics.js` | Fetches an owner's or a listing's view-count timeline, refetching on tab focus. |
| `useVoiceRecorder.js` | Records a voice note via the MediaRecorder API — idle/recording/stopped state machine. |

### `layouts/`

| File | What it does |
|---|---|
| `RootLayout.jsx` | Header + `<Outlet/>` + Footer shell wrapping every public-site route. |

### `locales/` — translation dictionaries

| File | What it does |
|---|---|
| `uz.js` | Uzbek strings for the public marketplace (the default language). |
| `ru.js` | Russian strings for the public marketplace. |
| `en.js` | English strings for the public marketplace. |
| `admin.js` | All three languages' strings for the admin dashboard, kept in a separate file since the two areas are translated and read independently. |
| `languages.js` | The list of supported languages the selector renders. |

### `pages/` — one file per public-site/dashboard route

| File | What it does |
|---|---|
| `HomePage.jsx` | Header, search, filters, and the listing grid. |
| `SearchPage.jsx` | Search results — every filter, the sort order and the page number live in the URL. |
| `ApartmentDetailsPage.jsx` | Gallery, price, specs, description, amenities, owner card, contact actions, similar listings. |
| `MapPage.jsx` | The near-full-viewport map view. |
| `WishlistPage.jsx` | "Saqlangan uylar" — the signed-in user's saved listings. |
| `LoginPage.jsx` | Sign-in form. |
| `RegisterPage.jsx` | The 3-step registration flow (request code → verify → set password). |
| `ForgotPasswordPage.jsx` | Requests a password-reset link. |
| `ResetPasswordPage.jsx` | Sets a new password from an emailed link. |
| `DashboardPage.jsx` | The `/dashboard` route's own shell/outlet. |
| `DashboardEditProfilePage.jsx` | The signed-in account's own profile edit form (name, avatar, phone/email, delete account). |
| `DashboardListingsPage.jsx` | The owner's own listings, filterable by status. |
| `DashboardChatsPage.jsx` | The full-page chat view (conversation list + open thread). |
| `DashboardReportsPage.jsx` | What this account has reported, and the outcome. |
| `BlockedUsersPage.jsx` | Everyone this account has blocked, with a way to unblock. |
| `CreateListingPage.jsx` | Route entry for both creating a new listing and editing an existing one. |
| `OwnerLandingPage.jsx` | The "for property owners" marketing page linked from the footer. |
| `MaintenancePage.jsx` | Shown to visitors while maintenance mode is on. |
| `NotFoundPage.jsx` | 404 page. |

### `pages/admin/` — one file per admin-dashboard route

| File | What it does |
|---|---|
| `AdminLoginPage.jsx` | The only way into the dashboard — no self-registration. |
| `AdminDashboardPage.jsx` | Headline stats, both growth charts, and the top-districts ranking. |
| `AdminUsersPage.jsx` | Marketplace accounts — search, filter, page, block/unblock. |
| `AdminUserDetailPage.jsx` | One marketplace account's own detail/history view. |
| `AdminListingsPage.jsx` | Every listing, or one status's worth (shared by all six status-filtered sidebar entries). |
| `AdminListingDetailPage.jsx` | One listing as a compact card: gallery, stats, owner, conversation audit, moderation actions. |
| `AdminChatsPage.jsx` | Conversations, for moderation — who spoke to whom, read-only. |
| `AdminReportsPage.jsx` | Complaints about listings — the table and the resolve/dismiss actions. |
| `AdminAnalyticsPage.jsx` | The dedicated analytics page (same underlying figures as the dashboard, presented in more depth). |
| `AdminNotificationsPage.jsx` | What's happened that an administrator should know about. |
| `AdminAuditLogsPage.jsx` | What administrators have done — the real, recorded action log. |
| `AdminSettingsPage.jsx` | The full site-configuration editor, laid out per `settingsSchema.js`. |
| `AdminAdminsPage.jsx` | Owner-only: the list of administrators, and the form to create a new one. |
| `AdminRolesPage.jsx` | What each role (owner/super admin) is actually allowed to reach, derived from the server's own enforced rules. |
| `AdminSidebarControlPage.jsx` | Owner-only: which sidebar sections a super admin is offered. |
| `AdminProfilePage.jsx` | The signed-in administrator's own name/avatar edit form. |
| `AdminDashboardSettingsPage.jsx` | The admin dashboard's own theme/language (scoped to the dashboard, never the public site). |
| `settingsSchema.js` | **Not a page** — the layout definition for `AdminSettingsPage.jsx`: one entry per setting the server declares in `internal/models/site_setting.go`, saying how it's edited (a switch, a number, a list) and which card it belongs to. The labels come from the dictionary and the actual rules from the server; this file only says how a value is drawn. |

### `routes/`

| File | What it does |
|---|---|
| `paths.js` | Every public-site route path in one place, plus `listingsPathFor` (which dashboard page a listing in a given status lives on). |
| `adminPaths.js` | Every admin-dashboard route path in one place. |

### `services/` — the only code that calls the API

Each file translates between the API's snake_case shapes and the camelCase
shapes components render, so a rename on either side is a change to one file.

| File | What it does |
|---|---|
| `apiClient.js` | The central HTTP client — base URL, auth header, envelope unwrapping, 401-triggered token refresh, error handling. Every other `*Api.js` file calls through this. |
| `authApi.js` | Registration (3 steps), login, session refresh/logout, profile update. |
| `apartmentsApi.js` | Listing CRUD, search, favorites, notifications — `toApartment`/`toApartmentPayload` are the shape translation. |
| `adminApi.js` | Every admin-dashboard endpoint. |
| `analyticsApi.js` | View-count timeline fetching and chart-point shaping. |
| `chatApi.js` | Conversations, messages, attachments. |
| `chatSocket.js` | Opens and manages the single realtime WebSocket connection, with automatic reconnect. |
| `favoritesApi.js` | Save/unsave, and the dashboard's saved-listings summary. |

### `test/`

| File | What it does |
|---|---|
| `setup.js` | Test-environment setup — registers `jest-dom` matchers (`toBeInTheDocument`, etc.) for every test file. |

### `utils/` — shared, UI-free logic

| File | What it does |
|---|---|
| `districtFocus.js` | Draws the "this district is selected" highlight on the map. |
| `districtGeometry.js` | Converts a district's GeoJSON boundary into what Yandex Maps expects (outer rings, bounds, center). |
| `filterApartments.js` | The client-side filter pipeline used by the Map page (which holds its whole catalog in memory rather than re-querying per filter change). |
| `filterApartments.test.js` | Unit tests for the above. |
| `formatChatTime.js` | Date/time formatting specific to chat message timestamps. |
| `formatPeriod.js` | Human labels for a chart point's period ("18–24 Avgust 2026", "Avgust 2026", ...). |
| `formatPrice.js` | Money formatting — amount + currency + rental period, in one place so no screen builds its own price string. |
| `formatRelativeTime.js` | "2 kun oldin" style relative timestamps. |
| `geo.js` | Haversine distance and "nearby apartments" filtering, used by the Map page's location feature. |
| `getSimilarApartments.js` | Picks the "similar listings" shown on the apartment detail page. |
| `listingText.js` | Resolves the title/description a listing actually displays (an owner's own text, verbatim — no translated fallback). |
| `mapFilterParams.js` | Maps the Map page's district/filter state to and from URL query params. |
| `readableText.js` | Turns ALL-CAPS text an owner typed into normal sentence case. |
| `redirectTarget.js` | Safe `?redirect=` handling for post-login navigation — rejects anything that isn't a same-origin relative path (open-redirect protection). |
| `searchParams.js` | The Search page's whole state ↔ URL query string translation (district, keyword, filters, sort, page). |
| `searchParams.test.js` | Unit tests for the above. |
| `sortApartments.js` | Client-side listing sort helpers. |
| `uploadUrl.js` | Turns a stored upload path into a loadable `<img>` URL by adding back the API origin. |
| `userInitials.js` | The two-letter initials shown when an account has no avatar. |
| `yandexMaps.js` | Loads the Yandex Maps JS API script once per page load and resolves with the `ymaps` namespace. |
