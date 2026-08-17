# RentHouse — Project Context

This file is the persistent source of truth for how this project is built.
Read it before starting any task. Do not repeat its contents back in chat —
just follow it.

## Product

RentHouse helps users find apartments for rent in **Tashkent, Uzbekistan**.
Default UI language: **Uzbek**. Code, variable names, routes, DB identifiers: **English**.

Core features: district-based search, keyword search, filters, apartment
listings, apartment details, map-based discovery, wishlist, user accounts,
owner listings, basic moderation.

This is a maintainable MVP intended to grow into a real product — not a demo.

## Modes / Roles

- **Guest** — browse, search, filter, view details, map, register, login.
  Cannot save to wishlist (prompt login/register instead).
- **User** — everything a guest can do, plus wishlist (add/remove/view), profile.
- **Owner** — create/edit/delete/view own apartment listings, upload images.
- **Admin** — manage users, view apartments, moderate/approve/reject listings,
  manage reports. Admin UI is separate from the public marketplace UI.

Roles: `USER`, `OWNER`, `ADMIN`. Never trust frontend role claims — always
verify role and ownership server-side.

## Search UX

Search bar has two parts:
- **Left**: district selector. Default label "Barcha tumanlardan". Custom
  searchable popover/list (not a native `<select>`). Real Tashkent districts,
  single source of truth (no duplicated district strings) — e.g. Sergeli,
  Chilonzor, Yunusobod, Shayxontohur, Mirobod, Yakkasaroy, Olmazor, Uchtepa,
  Bektemir, Yashnobod, Yangihayot, Mirzo Ulug'bek.
- **Right**: keyword search. Placeholder: "Ko'cha, metro yoki turar joy nomi...".
  Matches street/metro/landmark/apartment name.

District + keyword are combinable filters. Search triggers on Enter or the
Search button — not only an icon click.

## Filters (MVP)

district, price, rooms, area, floor, furnished, apartment type. Combinable.
Do not overload with more filters than this.

## Apartment Card

Contains: image, wishlist button (must NOT trigger card navigation), price/mo,
title, district, address, rooms, area, floor, upload time. Whole card is
clickable → apartment details.

## Pages

- **Home**: Header, Search, Filters, Apartment listings, Footer.
- **Search results**: summary ("247 ta uy topildi"), active filters, sorting
  (Eng yangi / Arzonidan qimmatiga / Qimmatidan arzoniga), count, cards,
  pagination or load-more, loading/empty/error states.
- **Apartment details**: gallery, price, title, district, address, rooms,
  area, floor, description, amenities, map/location, owner info (kept
  visually separate from property info), wishlist, contact action.
- **Map**: near full-viewport, price markers, marker interaction → preview →
  details, header stays accessible. Apartment coordinates come from the DB,
  never hardcoded in the frontend.
- **Wishlist**: "Saqlangan uylar". Useful empty state when empty.

## Auth

Register, login, logout, protected routes, role-based access. Passwords
hashed (never plaintext). JWT for auth once implemented.

## Owner Listings

Fields: title, description, price, district, address, latitude, longitude,
rooms, area, floor, total floors, furnished, apartment type, amenities,
images. Statuses: `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`.

## Admin (MVP scope only)

View users, view apartments, moderate/approve/reject listings, view reports.
Do not overbuild.

## Frontend Stack

JavaScript (NOT TypeScript, unless explicitly requested), React, Vite,
React Router, Tailwind CSS.

Suggested structure (create folders only as needed, don't pre-build):
```
frontend/
  src/
    assets/
    components/
    layouts/
    pages/
    routes/
    services/
    hooks/
    utils/
    data/
    App.jsx
    main.jsx
```

## Backend Stack

Go. Use Gin only where it clearly helps (routing/middleware/HTTP handling) —
don't add dependencies without a clear benefit.

Layering: **Router → Handler → Service → Repository → PostgreSQL**.
- Handler = HTTP concerns only.
- Service = business logic.
- Repository = DB access.
No business logic in handlers.

## Database

PostgreSQL, with migrations. Entities (create only when the matching feature
is implemented, not all up front): User, District, Apartment, ApartmentImage,
Wishlist, WishlistItem, Amenity, ApartmentAmenity, Report, RefreshToken.
Apartment references District by FK — no duplicated district strings.

## API

REST, versioned under `/api/v1`. Examples:
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/apartments
GET    /api/v1/apartments/:id
POST   /api/v1/apartments
PATCH  /api/v1/apartments/:id
DELETE /api/v1/apartments/:id

GET    /api/v1/districts

GET    /api/v1/wishlist
POST   /api/v1/wishlist/:apartmentId
DELETE /api/v1/wishlist/:apartmentId
```

Search: `GET /api/v1/apartments?district=&keyword=&min_price=&max_price=&rooms=&area=&floor=&furnished=&page=&limit=&sort=`.
Validate all query params; prevent invalid pagination. Don't add endpoints
that aren't needed yet.

## Design System

Minimalism. One font: **Inter**.

| Token | Hex |
|---|---|
| Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Secondary surface | `#F1F5F9` |
| Primary text | `#0F172A` |
| Secondary text | `#334155` |
| Muted text | `#64748B` |
| Border | `#E2E8F0` |
| Primary | `#059669` |
| Primary hover | `#047857` |
| Primary light | `#D1FAE5` |
| Error | `#E11D48` |
| Warning | `#F59E0B` |

Avoid excessive gradients, shadows, rounded containers, colors, decoration.
Focus on typography, spacing, hierarchy, photography, usability.

Breakpoints: Desktop 1440px (content max-width 1280px), Tablet 768px,
Mobile 390px. Build intentional mobile layouts, don't just shrink desktop.

Do not copy Airbnb/OLX/etc. Familiar UX patterns, original RentHouse UI.

## Accessibility & UI States

Semantic HTML, keyboard navigation, visible focus states, proper labels,
accessible buttons (not divs), form validation messages, meaningful alt
text, sufficient contrast.

Key components must handle: Loading, Success, Empty, Error, Disabled,
Hover, Focus, Active, Responsive. Never leave a blank screen.

## Security (once backend exists)

Hash passwords, validate input, validate uploaded files, protect private
routes, verify ownership & roles server-side, never trust frontend role
info, never expose secrets (use env vars), prevent cross-user apartment
edits, don't leak internal errors to clients.

## Image Storage

Design around a storage abstraction — don't couple tightly to one cloud
provider, don't store binaries in PostgreSQL. Simple local/pluggable
approach for MVP, swappable for cloud storage later.

## Development Rules

- Work feature-by-feature, incrementally. Small enough to understand,
  implement, test, review, commit as one unit.
- Every feature follows: PLAN → IMPLEMENT → RUN → TEST → FIX → REVIEW → COMMIT.
  Present a short plan before writing code.
- Don't scan the whole repo when it isn't needed for the task.
- Don't rewrite unrelated files. Don't add unneeded abstractions/dependencies.
- Reuse existing components/utilities before creating new ones.
- Keep chat explanations concise; don't paste whole files unless necessary.
- After a task: report what changed, files changed, checks run, remaining
  issues — briefly. Then stop; don't keep building beyond what was asked.

## Project Phases

0. Project foundation
1. Frontend foundation
2. Home page
3. Search and filters
4. Apartment listing
5. Apartment details
6. Authentication
7. Wishlist
8. Owner dashboard
9. Backend API
10. PostgreSQL/database
11. Frontend + backend integration
12. Map/location
13. Admin moderation
14. Testing
15. Docker and deployment

Don't skip architectural dependencies between phases. If reordering is
technically necessary, explain briefly before doing it.

## Final Rule

This is an implementation agent, not an autonomous product decision maker.
If a requirement is ambiguous: identify the ambiguity, propose the safest
option, ask before making a major irreversible decision. Don't invent major
features. Don't over-engineer.!!!!
