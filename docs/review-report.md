# Site review report

A pre-deployment audit covering every page and role — guest, signed-in user,
owner, admin, and owner-as-super-admin — across functional correctness,
responsive layout (1440 / 768 / 390px), accessibility, and backend security.
Findings below are grouped by what was found and fixed, and what is still
open. See git history for the individual commits; each fix was verified with
the project's own build/lint/test suite plus a live check (curl or a
browser) before being pushed, not just read for plausibility.

## Scope

**Public / guest**
- Home (header, search bar, filters, listing grid, footer)
- Search results (sorting, pagination, active-filter chips, empty/error states)
- Apartment details (gallery, amenities, map link, owner card, report dialog)
- Map (`/map` — Yandex Maps, marker preview, geolocation, layer switch)
- Auth: register (email + phone methods), login, logout, password reset

**Signed-in user**
- Wishlist ("Saqlangan uylar")
- Dashboard: profile edit, chats, blocked users, my reports
- Chat: conversation list, thread, attachments, block/report

**Owner** (a role earned by publishing, not a separate account type)
- Create/edit listing form, image upload, my-listings dashboard, listing
  status transitions, analytics (views)

**Admin / super admin**
- Dashboard (stats + growth charts + top districts)
- Users, listings (all/pending/active/closed/drafts/deleted), chats, reports,
  analytics, notifications, audit log, site settings, admins, sidebar
  visibility control, roles/permissions

**Backend**
- Every route's auth/ownership checks, rate limiting, file upload handling,
  admin auth, and the Docker/Compose deployment path itself.

## Fixed this cycle

### Security
- **Admin login had no rate limiting or account lockout at all** — unlimited
  password guessing was possible against the highest-privilege accounts in
  the system. Added the same per-identifier lockout (`login_attempts` table,
  namespaced apart from marketplace logins) and IP rate limit the
  marketplace's own login already had.
- **Admin avatar URL could point at another host** — `isOwnUpload`'s check
  only looked for the substring `/uploads/` anywhere in the URL, so
  `https://evil.example/x/uploads/y.jpg` passed. Every other administrator's
  browser would have fetched it — a tracking pixel with an audience. Fixed to
  discard the client's claimed host entirely and store only the path, the way
  the marketplace's own avatar field already worked.
- **Image uploads accepted anything with a matching `Content-Type` header** —
  an HTML/script file declared as `image/jpeg` was stored and served back.
  Added a magic-byte check (`http.DetectContentType`) for the four accepted
  image formats.
- **No rate limit on either upload endpoint** — an account could call
  `/uploads/images` or `/admin/profile/avatar` in a loop with no volume cap,
  a disk-exhaustion vector. Added `RATE_LIMIT_UPLOAD_MAX/WINDOW` (default
  60/hour), same mechanism as the other endpoints.
- **Sozlamalar / Admin boshqaruvi toggled visible for a super admin that the
  server would refuse anyway** — those two sections are `RequireOwner()`'d
  unconditionally; the sidebar-control page still offered a switch that
  implied a super admin could be granted them. Fixed the sidebar config and
  `/admin/permissions`'s own report to agree with what the server enforces.

### Deployment
- `GIN_MODE` was never set, so the container ran in Gin's verbose debug mode
  in production. Set to `release` in `docker-compose.yml`.
- `migrate down --confirm` — the documented command — silently ignored
  `--confirm` because Go's `flag` package stops parsing at the first
  non-flag argument. Rewritten to scan the whole argument list so both
  orderings work.
- The backend's port was published on every interface; combined with
  `TRUSTED_PROXIES` trusting the whole Docker bridge range, a caller hitting
  it directly (bypassing nginx) could under some Docker networking
  configurations spoof `X-Forwarded-For` and defeat the rate limits. Now
  bound to `127.0.0.1` only — still reachable for local debugging, never
  from outside the host.

### Correctness
- Apartment card markup nested `<button>` inside `<a>` — invalid HTML,
  unpredictable for screen readers. Rebuilt as a plain `<div>` with a
  "stretched link" title anchor and independently clickable action buttons.
- Editing a listing's gallery deleted the old image rows but never the files
  behind them — a permanent, growing storage leak. `Update` now diffs the
  old and new gallery and removes what was dropped.
- `AdminListingDetailPage`, `DashboardReportsPage`, `WishlistPage`, the
  Map page's catalog, and the chat conversation list / thread all folded a
  network or server error into "nothing here" / "no results" with no retry.
  Each now shows a distinct error state with a working retry action, and a
  genuine 404 (listing detail) is told apart from a transient failure.
- `AdminDashboardPage`'s "Eng faol tumanlar" card rendered nothing when
  empty; now matches the equivalent card on the analytics page.
- The "Uy turi" (apartment type) field, listed in CLAUDE.md's owner-listing
  and filter spec but never built, is now implemented end to end: migration,
  model, DTO, service, repository, admin detail view, create-listing form,
  search/map filters, and the details page.
- Profile page's email field rendered as editable despite `disabled` being
  passed to it — `FormField` wasn't forwarding the prop to the input.
- The "faqat o'qilmagan" notification filter toggle had no `aria-pressed`.
- Phone-number registration disabled (Eskiz SMS is not connected yet) —
  intentional, temporary, reversible in `RegisterPage.jsx`.

## Known issues — not fixed, not blocking

Ranked by what would actually bite someone versus what is pure polish.

**Worth fixing soon:**
1. Several admin pages still fold a load failure into an empty/blank state
   with no retry: `AdminUsersPage`, `AdminListingsPage`, `AdminAdminsPage`,
   `AdminChatsPage` (both the list and the open thread), and
   `AdminDashboardPage`'s whole-page failure. `BlockedUsersPage` (dashboard)
   has the same gap. Same fix as already applied elsewhere — add
   `actionLabel`/`onAction` to the existing `EmptyState`.
2. `DashboardOverview`'s summary card and views chart have the same gap, but
   both hooks already auto-refetch on window focus, so a transient failure
   tends to self-heal.
3. `ContactChatModal`'s generic-failure state has no retry (closing and
   reopening the modal is a workaround).

**Cosmetic / low priority:**
4. No dialog in the app traps Tab focus inside itself while open — Escape and
   initial focus work, cycling does not. Affects every modal uniformly, not
   a regression.
5. `ApartmentCard` does not show the street address (CLAUDE.md's card spec
   lists it) — district + city only. May be a deliberate density choice;
   worth a one-line confirmation rather than assuming either way.
6. Apartment view-recording dedupes by an hourly bucket keyed on a hash of
   IP + User-Agent; rotating either bypasses the dedupe. Insert-only, no
   read amplification — low severity.

**Deployment documentation gaps (infrastructure, not code):**
7. No HTTPS/reverse-proxy instructions anywhere in the repo — the app
   correctly assumes TLS termination happens in front of it (see the
   security-headers comments), but nothing tells an operator to actually put
   Caddy/nginx+Certbot/a cloud load balancer there. `frontend/nginx.conf`
   only listens on port 80.
8. `UPLOAD_DIR`, `UPLOAD_PUBLIC_PATH`, `PUBLIC_BASE_URL` are read but not
   listed in `backend/.env.example`; all three have safe defaults for the
   shipped `docker-compose.yml`, but `PUBLIC_BASE_URL` in particular is what
   a deployment behind a CDN or a differently-named domain would need to set.
9. CI (`.github/workflows/ci.yml`) runs `go build`/tests but never builds
   either `Dockerfile`, and only exercises `migrate up`, never `migrate
   down` — a Docker-specific or down-migration regression would not be
   caught before it reached production.
10. No log rotation or per-container resource limits (`mem_limit`/`cpus`) in
    `docker-compose.yml` — reasonable to skip for a small MVP box, listed for
    completeness.
11. Base image tags (`golang:1.25-alpine`, `node:22-alpine`) float within a
    minor version rather than being pinned to a digest.

## Decisions still pending user input (not defects)

- `ApartmentCard` opens every listing in a new tab (`target="_blank"`) —
  confirmed deliberate in the code; flagged in case it's worth reconsidering,
  not treated as a bug.
- `AdminSettingsPage` exposes 50+ configurable fields, well past CLAUDE.md's
  stated MVP admin scope ("Do not overbuild"). A product/scope call, not
  something to trim without direction.
