# RentHouse — Project Architecture

This document describes the **current, actually-implemented** architecture of
RentHouse as of this writing. It intentionally does not describe planned
features as if they exist — those are called out separately in
[Section 14](#14-planned-architecture--not-implemented).

For product/design rules that govern how new work should be built, see
[CLAUDE.md](./CLAUDE.md). This file is a factual snapshot of what's built.

---

## 1. Project Overview

RentHouse is an apartment rental marketplace for **Tashkent, Uzbekistan**.
It helps users discover apartments for rent via district-based search,
keyword search, filters, a map, and a wishlist, and lets owners eventually
list their own apartments.

**Current state:** the project is a **frontend-only MVP**. There is no
backend, no database, and no real authentication yet. All apartment data is
a static, in-memory JavaScript array (`frontend/src/data/apartments.js`)
bundled into the app at build time. Wishlist state is the only thing
persisted, and it's persisted to the browser's `localStorage`, not a server.

Implemented so far: Home page (search, filters, sort, listings), Wishlist
page, Apartment Details page (gallery, amenities, owner, similar listings),
the Map page (Leaflet, district boundaries, geolocation/nearby apartments),
a responsive header/footer, and full uz/ru/en localization. Not yet
implemented: authentication, the Go backend, and the database.

---

## 2. Project Structure

```
Rent-House/
├── CLAUDE.md                  Persistent project rules/conventions (read this first)
├── PROJECT_ARCHITECTURE.md    This file
├── README.md                  One-paragraph project pointer to CLAUDE.md
├── .gitignore
├── backend/                   Empty placeholder (.gitkeep only) — not started
└── frontend/
    ├── index.html             Vite entry HTML (Inter font links, #root mount point)
    ├── vite.config.js         Vite config: @vitejs/plugin-react + @tailwindcss/vite
    ├── package.json
    ├── package-lock.json
    ├── .oxlintrc.json         oxlint (linter) config
    ├── README.md              Frontend-specific dev notes
    └── src/
        ├── main.jsx           ReactDOM root render entry point
        ├── App.jsx            Provider tree + React Router route table
        ├── index.css          Tailwind import + design-token theme + base styles
        ├── assets/            (empty — no static assets checked in yet)
        ├── layouts/
        │   └── RootLayout.jsx     Header + <Outlet/> + Footer shell for every route
        ├── pages/                 One file per route (see Section 6)
        ├── components/            Reusable, mostly presentational UI pieces
        ├── context/               React Context providers (global client state)
        ├── data/                  Static mock data (apartments, districts)
        ├── locales/               uz/ru/en translation dictionaries
        ├── routes/
        │   └── paths.js           Single source of truth for route path strings
        ├── hooks/
        │   └── useDismiss.js      Shared outside-click/Escape-to-close hook
        └── utils/                 Pure helper functions (formatting, filtering, sorting, geo)
```

There is **no `services/` folder yet** (listed as a suggested future folder
in CLAUDE.md) because there is no backend to call — components read
directly from `data/apartments.js` and Context.

---

## 3. Frontend Architecture

**Framework:** React 19, function components + hooks only (no class
components).
**Build tool:** Vite 8, with `@vitejs/plugin-react` and `@tailwindcss/vite`.
**Language:** JavaScript (JSX), no TypeScript.
**Routing:** `react-router-dom` v7, client-side, `BrowserRouter`.
**Styling:** Tailwind CSS v4, utility classes inline in JSX; no CSS Modules,
no styled-components.
**Icons:** `lucide-react` (tree-shaken per-icon imports) plus a handful of
hand-written inline SVGs for icons predating that dependency (e.g. the
wishlist heart, chevrons in dropdowns).

### Pages (`src/pages/`)

One component per route, wired up in `App.jsx`. Pages own page-level data
fetching/derivation (from the static `APARTMENTS` array + Context) and
compose components. See [Section 6](#6-current-routes) for the full list.

### Components (`src/components/`)

Reusable, mostly presentational pieces. Notable ones:

- `Header.jsx` — global nav, two layouts in one component (desktop single
  row at `xl:`, a compact logo+language+hamburger version below that with
  its own full-width search row and slide-down menu).
- `Footer.jsx`, `Container.jsx` (the shared 1344px max-width page container).
- `SearchBar.jsx` — wraps `DistrictSelector` + a keyword `<input>` + submit
  button; keyword text is local state until submit, district selection is
  live.
- `DistrictSelector.jsx` — custom searchable popover (not a native
  `<select>`), reads the single-source `DISTRICTS` list.
- `LanguageSelector.jsx` — dropdown over the 3 supported locales.
- `FilterBar.jsx` / `FilterPanel.jsx` — **props-controlled, not tied to any
  one Context.** Callers pass `filters`, `setFilters`, `clearFilters`,
  `activeFilterCount`, and two booleans (`showDistrict`, `showFloor`) that
  toggle which fields render. This is what lets Home (global `SearchContext`
  filters, floor field, no district field) and Wishlist (local page state,
  district field, no floor field) share the exact same filter UI without a
  duplicate filtering system.
- `SortDropdown.jsx` — same pattern: takes `sort`/`onChange`/`options` as
  props. Exports `DEFAULT_SORT_OPTIONS` (5 options) as a named export so
  Wishlist can import and extend it with 2 more (`savedNewest`/`savedOldest`).
- `ApartmentCard.jsx` — the core listing card. Renders as a real `<a
  target="_blank" rel="noopener noreferrer">` (opens details in a new tab),
  with nested wishlist/map `<button>`s that `stopPropagation` +
  `preventDefault` so they don't trigger the card's own navigation. Reads
  wishlist state from `WishlistContext` directly (not passed as props).
- `ApartmentGrid.jsx` — the loading/empty/data switch for a list of
  apartments (1/2/4-column responsive grid). Accepts optional
  `emptyIcon`/`emptyTitle`/`emptyDescription`/`emptyActionLabel` overrides
  (default to the Home page's "no results" copy) so Wishlist can show a
  different message for "filters matched nothing" without a second grid
  component.
- `ApartmentCardSkeleton.jsx`, `ApartmentDetailsSkeleton.jsx` — loading
  placeholders matching each page's real layout.
- `EmptyState.jsx` — generic centered message+action block (optional
  `icon` prop), reused by `ApartmentGrid` and the Apartment Details
  not-found state.
- `ImageGallery.jsx` — main image + prev/next + 5-thumbnail strip, local
  `activeIndex` state.
- `ContactChatModal.jsx` — **UI-only mock chat**, see Section 13.
- `ApartmentMap.jsx` — vanilla Leaflet map (imperative `useRef`/`useEffect`
  integration, **not** `react-leaflet` — chosen to avoid a React 19 peer-dep
  conflict, since plain `leaflet` has zero peer deps). Renders price-pill
  markers, the selected district's boundary + dim mask, the current-location
  control/marker, and exposes `onMarkerClick`. See "Map page architecture"
  below.
- `MapApartmentPreview.jsx` — the small card shown over the map when a
  marker (or a `?apartment=` deep link) is selected; reuses
  `apartmentDetailsPath()` for its "Batafsil ko'rish" button so it navigates
  to the same `ApartmentDetailsPage` as everywhere else, not a duplicate view.

### User account system (`/dashboard`, `/create-listing`)

The account area is a **second layout**, not part of `RootLayout`: it needs its
own header without the public search bar and without login/register buttons.
`App.jsx` therefore mounts these routes under `components/dashboard/DashboardLayout`
instead. `/create-listing` sits outside the `/dashboard` path but renders inside
the same shell, so posting a listing never drops the user out of their account.

Unlike the public pages (which centre on `Container`'s 1344px max width), the
dashboard is **full-bleed**: the sidebar is flush against the left edge of the
viewport and the main area takes the remaining width, so there is no empty
margin beside the navigation on wide screens.

| File | Responsibility |
|---|---|
| `dashboard/DashboardLayout.jsx` | Account shell: header + persistent sidebar (`lg:` and up) + `<Outlet/>`, and owns the mobile drawer's open state. |
| `dashboard/DashboardHeader.jsx` | Logo (links Home), hamburger below `lg:`, avatar + user name on the right. Deliberately has no `SearchBar` and no auth buttons. |
| `dashboard/DashboardSidebar.jsx` | Desktop `<aside>` (`w-64`, flush left, sticky full-height below the header). Also exports `DashboardNavList`, the actual entry list, so the drawer reuses the exact same items instead of duplicating them. |
| `dashboard/DashboardMobileMenu.jsx` | Slide-in drawer below `lg:`, portalled to `<body>` so no ancestor stacking context can clip or offset it. Closes on link tap, backdrop click and Escape. |
| `dashboard/DashboardNavItem.jsx` | One entry. Every item shares the same size/padding/structure; `accent` only tints the icon (used by "post a listing", which is important but must not be a differently-shaped CTA) and `badge` renders the unread counter. Active state comes from `NavLink`'s `isActive`. Also exports `NAV_ITEM_BASE`/`NAV_ITEM_ACTIVE`/`NAV_ITEM_IDLE` so the Settings `<button>` can look identical to the `NavLink` entries without duplicating classes. |
| `dashboard/DashboardSettingsMenu.jsx` | Settings entry + its popover (language, theme, "edit profile"). Opens below its trigger and flips above when the viewport has no room, measured in a `useLayoutEffect`; dismissed via the shared `useDismiss`. |
| `dashboard/ProfileOverview.jsx` | Read-only account overview + the three stat cards. |
| `dashboard/MyListingCard.jsx` | One owner-side listing row: image, title, district, price, specs, status badge, views/saves/date and the per-listing actions. Image left / details right from `sm:` up, stacked below. |
| `dashboard/UserAvatar.jsx` | Initials-based avatar, so the account UI needs no image asset or upload pipeline yet. Reused by the chat list, thread header and public header. |
| `chat/ChatConversationList.jsx` | Left panel: title, search field, scrollable list. Filters on participant name **and** last-message preview; orders by newest activity (deliberately not unread-first — that reorders the list under the pointer that just cleared a badge). |
| `chat/ChatConversationItem.jsx` | One row: avatar, name, preview, compact time, unread badge. Unread rows are distinguished by weight + badge, not by position. |
| `chat/ChatThread.jsx` | Right panel: participant header with online state, the scrolling message area (listing context pinned on top), composer underneath. Owns the scroll-to-latest effect. |
| `chat/ChatMessage.jsx` | One bubble. Outgoing = right + primary fill, incoming = left + secondary surface, so the two differ by side *and* fill. |
| `chat/ChatApartmentPreview.jsx` | The listing a conversation is about: image, price, title, district and a link to its details page. |
| `chat/ChatComposer.jsx` | Text input, attachment control and send button. Attachment is disabled while no upload pipeline exists rather than silently doing nothing. |
| `data/currentUser.js` | **Mock** signed-in user (first/last name, name, email, phone, stats). Read only by `AuthContext`, which is the single place to replace when auth arrives. |

Navigation order is: Profile → Post a listing (green icon accent) → My listings
→ Chats (unread badge) → Settings. **Log out is pinned to the very bottom** of
the column via `mt-auto`, in both the sidebar and the drawer, so it never sits
directly under Settings. Log out clears the UI-only session flag (`AuthContext`)
and returns Home — there is still no token or API call.

**Settings is a popover, not a page.** There is no `/dashboard/settings` route:
the entry is a `<button>` that opens `DashboardSettingsMenu` next to itself,
holding a three-option language row (existing `LocaleContext`), a Light/Dark row
(`ThemeContext`) and, at the bottom, "Edit profile", which closes the popover and
navigates to `/dashboard/edit-profile`. Keeping it in place means changing the
language or theme never costs the user their current dashboard section.

`/dashboard/edit-profile` renders the edit form in the **main dashboard body**
(avatar preview + change-avatar action, first name, last name, email, phone,
save) using the shared `FormField`. The picked file is previewed locally via
`URL.createObjectURL` and never uploaded; save only updates `AuthContext` in
memory. `/dashboard/profile` stays a read-only overview. My listings, Chats and
`/create-listing` remain professional empty states.

**Chat (`/dashboard/chats`).** A two-panel messaging page: conversation list on
the left, thread on the right, from `md:` up. Below `md:` only one panel is
rendered at a time — the list, or the selected thread with a back button — so the
two never compete for a 390px viewport.

The selected conversation lives in the URL (`?c=<id>`), not in component state,
so the browser back button, a reloaded tab and a shared link all behave the way
the user expects, and the header's chat icon can deep-link into a conversation
later. The page fills the dashboard main area exactly (`100vh` minus the 4rem
header and the main padding) and only the two panels scroll, which is what keeps
the composer reachable without pinning it with `position: fixed`.

`context/ChatContext.jsx` holds the conversations. It exists so the page, the
sidebar badge and the public header's chat icon read **one** unread count —
opening a conversation clears the badge in all three at once. `data/conversations.js`
is the mock dataset; message text goes through i18n keys
(`chatMessage.<conversationId>.<messageId>`) exactly like apartment titles, so the
demo content translates with the rest of the app, while locally sent messages
carry their text directly.

**My listings (`/dashboard/listings`).** `data/myListings.js` holds the owner-side
fields (status, created date, views, saves) and references the apartment by id,
so listing content — image, title, price, district, specs — has one source of
truth and no second set of images or translated titles. `getMyListings()` merges
the two into the flat shape the UI consumes, which is what
`GET /api/v1/users/me/listings` would return: swapping the source out later does
not touch the components. Statuses are `APPROVED` / `PENDING` / `CLOSED`
(`CLOSED` is the owner-side end state, alongside the documented apartment
statuses), labelled through `listingStatus.<id>` keys. The page keeps its empty
state for the zero-listing case.

**Authenticated public header.** When `AuthContext` reports a session, the public
`Header` swaps its "log in" link and "register" button for
`components/AuthedHeaderActions.jsx`: a chat shortcut (unread badge → 
`/dashboard/chats`) plus avatar + name (→ `/dashboard/profile`), in both the
desktop nav and the mobile drawer. The signed-out header is untouched.

**Theme system.** `context/ThemeContext.jsx` follows the same shape as
`LocaleContext`: `light | dark | system`, persisted to `localStorage`
(`renthouse_theme`). It **defaults to `light`** — the app shipped light-only, so
only an explicitly stored preference switches it; `system` is opt-in from
Settings and then tracks `prefers-color-scheme`. It toggles a `dark` class on
`<html>`; `index.css` declares a `@custom-variant dark` plus a `html.dark`
block that re-declares the **same token names** with dark values, so components
keep using the semantic classes (`bg-surface`, `text-text-primary`,
`border-border`) and inherit dark mode without per-component changes.

It is one app-wide system: `components/ThemeToggle.jsx` (a Light/Dark switch)
sits in **both** the public `Header` and the account `DashboardHeader`, and
the Settings popover additionally exposes an explicit Light/Dark choice. There is
no second theme implementation.

**Surfaces that deliberately stay light in dark mode.** Anything floating over
a photo or over the always-light Yandex map keeps fixed light-scheme colours
(`text-slate-600/700/900` on white glass) instead of theme tokens — the map
price markers, the map glass control bar and its filter chips, the map controls,
the gallery arrows and the wishlist buttons. Using tokens there would make them
light-on-light and unreadable. Modal scrims likewise use a fixed
`bg-slate-900/40` rather than a token, so the overlay stays dark in both themes.

**Currently UI only:** conversations and messages are mock data — sending appends
to `ChatContext` in memory and is gone on reload, there is no WebSocket, no
delivery/read receipts and no attachment upload. The user is mocked, the "session" is a single
`localStorage` flag set by any valid login-form submit (no credential check, no
token), no route is protected, the stats and the unread badge are placeholders,
and saving the profile / listings / chats / create-listing have no data behind
them. Avatar changes are a local object-URL preview only — nothing is uploaded.
Language and appearance are the two settings that genuinely persist.

**Planned backend integration:** replace `data/currentUser.js` + `AuthContext`'s
flag with the session user from `GET /api/v1/auth/me` and a real token; guard the `/dashboard` and `/create-listing`
routes once auth exists; back My listings with apartment CRUD
(`POST/PATCH/DELETE /api/v1/apartments`), Chats with a real messaging endpoint,
and the stat cards + unread badge with server-side counts.

### Map page architecture (`/map`)

`MapPage.jsx` composes the existing search/filter architecture with
`ApartmentMap.jsx` — there is **one** filtering pipeline, not a
map-specific duplicate:

- **Filtering:** `MapPage` reads `districtId`/`filters` from the same
  `SearchContext` used by Home, and calls the same
  `filterApartments(APARTMENTS, { districtId, keyword: '', filters })`
  util (keyword search is disabled on this route — see `SearchBar.jsx`'s
  `isKeywordSearchDisabled`). The resulting `visibleApartments` array is
  the single source both the marker list and the results-count pill read
  from — selecting a district or opening `FilterBar` narrows both
  identically, with no separate map query.
- **District boundaries:** real GeoJSON, not hand-approximated. `data/districts.js`
  is now just search/selection metadata (`{ id, name }`); the actual geometry
  lives in `data/districts.geo.json` (a standard GeoJSON `FeatureCollection`,
  `Feature.properties.id` matching a `DISTRICTS` entry) + `data/districtBoundaries.js`
  (`getDistrictFeature(id)` lookup). Each boundary was built from the district's
  real OSM administrative relation (fetched full-resolution via the Overpass
  API, outer ways joined into closed ring(s), simplified with
  Ramer–Douglas–Peucker) — not a circle, not stride-sampled, not eyeballed.
  Full detail (including the `MultiPolygon` exclave case) is in
  `docs/map-page.md`.
- **District selection visuals:** when a district is selected, `ApartmentMap`
  renders two `L.geoJSON` layers: (1) a world-covering mask Polygon with the
  district's outer ring(s) as holes, semi-transparent dark fill, to dim
  everything outside the district without hiding geographic context; (2) the
  district's own feature, styled with a clear `--color-primary` (green)
  outline and no fill. The map then `flyToBounds()`s the boundary layer's
  *actual* bounding box (not a hardcoded per-district center point). Markers
  live in Leaflet's `markerPane` (z-index above the vector `overlayPane`), so
  they're never visually obscured by the mask. Apartments outside the
  district are simply absent from `visibleApartments` (filtered upstream),
  not hidden via CSS/opacity.
- **Stacking/z-index:** `ApartmentMap`'s root div is `absolute inset-0 z-0`
  — an explicit `z-0` is required (not just `position`) so it establishes
  its **own stacking context**, which contains Leaflet's internal
  `.leaflet-top`/`.leaflet-bottom` control panes (`z-index: 1000` in
  Leaflet's bundled CSS). Without that, those panes have no bounding
  stacking context and compete directly against `Header`'s `sticky z-30`
  context in the document root, winning and rendering over the district
  dropdown. `MapPage`'s own floating overlay (`FilterBar`, result pill,
  preview card) is `absolute inset-0 z-10` for the same reason — enough to
  sit above the map, but still below Header.
- **Layout height:** `MapPage`'s root is `flex-1` (not `h-full`/`h-[80vh]`).
  Percentage heights (`h-full`) don't resolve against an ancestor whose own
  height comes from `flex-grow` rather than an explicit `height` — per the
  CSS spec, that's treated as an "indefinite" containing block, so the
  percentage silently falls back to auto. `RootLayout`'s `<main>` was
  changed to `flex flex-1 flex-col` specifically so `flex-1` can propagate
  down through `MapPage` to the map without that percentage-height trap
  (this is what previously left a visible gap above `Footer`).
- **Geolocation & nearby apartments:** a Leaflet custom control
  (`LocateControl`, stacked in the same `topright` corner as the zoom
  control) calls `onLocateRequest`, owned by `MapPage`. It calls
  `navigator.geolocation.getCurrentPosition()` directly — no custom
  permission UI — only on click, and only handles success/error there
  (denied/unavailable/timeout/unsupported all map to a small status pill
  via `map.location*` locale keys instead of a raw browser error or a
  crash). On success, `userLocation` is passed to `ApartmentMap`, which
  renders a small pulsing blue dot (+ accuracy circle) and flies to it.
  `utils/geo.js` exports `getDistanceKm` (haversine) and
  `getNearbyApartments(apartments, userLocation, radiusKm = 3)`, kept
  framework-agnostic and isolated specifically so the same client-side MVP
  logic can move to a backend query later without touching `MapPage` or
  `ApartmentMap`. Nearby apartments aren't a second filter — they're a
  presentation layer on top of the already-filtered `visibleApartments`
  (a status pill + a subtle ring style on their markers).
- **Deep links:** `/map?apartment=:id` is read once via a
  `hasFocusedInitialApartment` ref inside `ApartmentMap`, which centers the
  map on that apartment and calls the same `onMarkerClick` a real marker
  click would — so it opens `MapApartmentPreview`, not a separate code
  path, and "Batafsil ko'rish" still routes to `ApartmentDetailsPage`.

### Hooks (`src/hooks/`)

Just one shared hook: `useDismiss(ref, isOpen, onClose)` — attaches
document-level `mousedown`/`Escape` listeners while `isOpen`, calling
`onClose` on outside-click or Escape. Used by every popover (district
selector, language selector, sort dropdown, filter panel).

### State management

No Redux/Zustand/MobX — **plain React Context + `useState`**, one
provider per concern (see [Section 8](#8-state-management)).

### API communication

**None yet.** There is no `fetch`/`axios` call anywhere in the codebase.
Every page reads apartment data by importing `APARTMENTS` from
`src/data/apartments.js` directly and filtering/sorting it in memory.

### Design system

Centralized as Tailwind `@theme` tokens in `src/index.css` — see
[Section 9](#9-design-system).

### Utilities (`src/utils/`)

Pure functions, no side effects, no React imports:
- `filterApartments(apartments, { districtId, keyword, filters })`
- `sortApartments(apartments, sortKey)`
- `getSimilarApartments(apartment, apartments, limit)` — scores every other
  apartment (district match, price/area/room closeness) and returns the top
  N; written as a pure, swappable function specifically so it can later be
  replaced by a call to a recommendations API without changing call sites.
- `formatUzsAmount`, `formatPostedAt`, `formatUzsShort` — display formatting.
- `getDistanceKm(lat1, lng1, lat2, lng2)`, `getNearbyApartments(apartments,
  userLocation, radiusKm)` — haversine distance + client-side "nearby"
  matching for the Map page's geolocation feature; safely skips apartments
  without valid coordinates.

### How the pieces communicate

```
Route (App.jsx)
  → Page component (e.g. HomePage)
      reads:  useSearch() / useWishlist() / useLocale()   (Context)
              APARTMENTS                                   (static import)
      derives: filterApartments() → sortApartments()        (utils)
      renders: FilterBar, SortDropdown, ApartmentGrid       (components, controlled via props)
                 → ApartmentCard (reads WishlistContext itself)
```

---

## 4. Backend Architecture

**There is no backend.** `backend/` contains only a `.gitkeep` file.

Per CLAUDE.md, when built it will be **Go**, layered
**Router → Handler → Service → Repository → PostgreSQL**, using Gin only if
it clearly helps. None of that code exists today — see
[Section 14](#14-planned-architecture--not-implemented) for how it's
expected to integrate with what's already built.

---

## 5. Data Flow

Current (frontend-only, mock data) flow, e.g. for the Home page:

```
User interacts with SearchBar / DistrictSelector / FilterPanel / SortDropdown
        ↓
Context state updates (SearchContext: districtId, keyword, filters, sort)
        ↓
HomePage re-renders, reads APARTMENTS (static in-memory array)
        ↓
utils/filterApartments()  →  utils/sortApartments()
        ↓
ApartmentGrid renders ApartmentCard[] (or a loading/empty state)
        ↓
User clicks a card → new browser tab → /apartment/:id
        ↓
ApartmentDetailsPage looks up the same id in APARTMENTS, renders it
```

Wishlist follows the same shape but writes through `WishlistContext`, which
also persists to `localStorage` on every change and rehydrates from it on
load — the only state in the app that survives a page reload.

There is currently **no network request anywhere** in this flow — "Response"
and "Database" steps from a typical data-flow diagram don't exist yet.

---

## 6. Current Routes

Defined in `src/routes/paths.js` (`ROUTES` object) and wired in `App.jsx`.
All routes render inside `RootLayout` (Header + `<Outlet/>` + Footer).

| URL | Page component | Purpose | Status |
|---|---|---|---|
| `/` | `HomePage` | Search, filters, sort, apartment grid | Implemented |
| `/search` | `SearchPage` | Placeholder | Not implemented (`PagePlaceholder`) |
| `/apartment/:id` | `ApartmentDetailsPage` | Full listing detail: gallery, facts, description, amenities, owner, similar listings | Implemented |
| `/map` | `MapPage` | Leaflet map: district boundaries, filters, geolocation/nearby apartments, `?apartment=` deep link | Implemented (frontend-only, mock data) |
| `/wishlist` | `WishlistPage` | Saved apartments, own filter/sort, empty states | Implemented |
| `/login` | `LoginPage` | Sign-in form: identifier + password, password visibility toggle, forgot-password and register links | UI only (no backend, no session) |
| `/register` | `RegisterPage` | Sign-up form: name, email, phone, password + confirmation, password visibility toggles, login link | UI only (no backend, no account created) |
| `/profile` | `ProfilePage` | Placeholder (superseded by `/dashboard/profile`) | Not implemented |
| `/dashboard` | — | Redirects to `/dashboard/profile` | Implemented |
| `/dashboard/profile` | `DashboardPage` → `ProfileOverview` | Account overview: avatar, name, email, phone, stat cards, "Edit profile" link | UI only (mock user) |
| `/dashboard/listings` | `DashboardListingsPage` | My listings: summary counts, "+ post a listing" action, one card per listing with status and metrics. Falls back to the empty state when there are none | UI only (mock data) |
| `/dashboard/chats` | `DashboardChatsPage` | Two-panel chat: conversation list + search, thread with listing context, composer. `?c=<id>` selects a conversation | UI only (mock data, in-memory sends) |
| `/dashboard/edit-profile` | `DashboardEditProfilePage` | Profile edit form in the dashboard body: avatar preview + change action, first/last name, email, phone, save | UI only (in-memory save, no upload) |
| `/create-listing` | `CreateListingPage` | Listing form shell, rendered inside the account layout | UI only |
| `/owner` | `OwnerDashboardPage` | Placeholder | Not implemented |
| `/admin` | `AdminPage` | Placeholder | Not implemented |
| `*` | `NotFoundPage` | 404 | Implemented |

`apartmentDetailsPath(id)` in `routes/paths.js` builds `/apartment/:id`
links so no component hardcodes the path string.

**Backend API routes:** none exist. CLAUDE.md documents the *intended*
REST shape (`/api/v1/auth/...`, `/api/v1/apartments`, `/api/v1/districts`,
`/api/v1/wishlist/...`) for when the Go backend is built — that's a plan,
not current code.

---

## 7. Apartment Data Model

Source of truth: `frontend/src/data/apartments.js`, exporting a plain array
`APARTMENTS`. Each object currently has:

| Field | Type | Notes |
|---|---|---|
| `id` | number | Stable identifier, used in the `/apartment/:id` route |
| `title` | string | **Uzbek only** in the data file; the *displayed* title actually comes from `apartmentTitle.<id>` in the locale files (see Section 8) so it can be uz/ru/en. The raw `title` field itself is effectively unused for display now. |
| `price` | number | Monthly rent in UZS, e.g. `4500000` |
| `districtId` | string | FK-like reference into `data/districts.js` (`DISTRICTS`) — district names are never duplicated on the apartment object |
| `address` | string | Free-text street-level address (Uzbek only, not localized) |
| `rooms` | number | |
| `area` | number | m² |
| `floor` | number | |
| `totalFloors` | number | |
| `furnished` | boolean | |
| `image` | string | Single cover image URL (Unsplash), used by `ApartmentCard` |
| `images` | string[] | 5-photo gallery array (first entry duplicates `image`), used by `ImageGallery` on the details page |
| `amenities` | string[] | Keys like `'wifi'`, `'parking'` — looked up against an icon map and `amenity.<key>` translation strings, not raw text |
| `owner` | `{ name, phone }` | Mock owner contact info; `phone` feeds the `tel:` call link |
| `postedAt` | ISO date string | Generated relative to "now" at module load (`hoursAgo(n)` / `daysAgo(n)` helpers) so relative-time display stays realistic |
| `latitude`, `longitude` | number | Used by the Map page for marker placement, district point-in-polygon consistency, and the geolocation "nearby apartments" distance calculation |
| `searchText` | string | Pre-lowercased blob of title/address/landmark keywords for keyword search matching — independent of the `title` field |

**Missing / not yet on the model** (relevant to near-term features):
- No `apartmentType` field (CLAUDE.md's filter list mentions "apartment
  type" but the UI never implemented that filter — only district, price,
  rooms, area, floor, furnished exist today).
- No `status` (`DRAFT`/`PENDING`/`APPROVED`/`REJECTED`) — moderation
  doesn't exist yet.
- No `ownerId` linking to a `User` — owners are just an inline
  `{name, phone}` blob, not a real entity, because there's no auth/user
  system yet.
- `title`/`address` aren't localized at the data level (RU/EN titles live
  in the locale files under a separate `apartmentTitle.<id>` key instead —
  a bit of an inconsistency worth resolving once this becomes real backend
  data with a proper i18n strategy).

---

## 8. State Management

No global state library — **React Context**, three providers, all mounted
in `App.jsx` around the router (`LocaleProvider` → `SearchProvider` →
`WishlistProvider` → `BrowserRouter`):

| Concern | Provider | Backing store | Notes |
|---|---|---|---|
| **Locale** | `LocaleContext` | `useState` + `localStorage` (`renthouse_locale`) | Holds `locale` (`'uz' \| 'ru' \| 'en'`), `setLocale`, and `t(key, params)` — a flat-dictionary lookup with `{param}` interpolation, no external i18n library. Falls back to `uz` for missing keys. |
| **Search (Home page only)** | `SearchContext` | `useState` (in-memory, not persisted) | `districtId`, `keyword`, `filters` (price/rooms/area/floor/furnished), `sort`. This is explicitly **Home-page-scoped** — Wishlist does *not* use this context, it keeps its own local `filters`/`sort` state in `WishlistPage` itself, because its filterable field set differs (district instead of floor) and its results are the saved subset, not the global catalog. |
| **Wishlist** | `WishlistContext` | `useState` (`Map<id, savedAtISOString>`) + `localStorage` (`renthouse_wishlist`) | `toggleWishlist(id)`, `isSaved(id)`, `getSavedAt(id)`, `savedCount`. The only client state that survives a reload. `ApartmentCard` reads this directly (not via props) so wishlist toggles stay in sync across every page that renders a card. |
| **Theme** | `ThemeContext` | `useState` + `localStorage` (`renthouse_theme`) | `theme` (`'light' \| 'dark' \| 'system'`), `setTheme`, `resolvedTheme`. Toggles a `dark` class on `<html>`; dark values are token overrides in `index.css`, so components need no per-element dark classes. **Defaults to `light`**; `system` is opt-in and then tracks `prefers-color-scheme`. Switched from `ThemeToggle` in both headers, or the Light/Dark row in the Settings popover. |
| **Session (UI only)** | `AuthContext` | `useState` + `localStorage` (`renthouse_session`) | `isAuthenticated`, `user`, `signIn()`, `signOut()`, `updateUser()`. Defaults to signed out. There is no credential check, request or token behind it — it only decides whether the public header shows its signed-in variant and gives log out / profile edit something real to change. Replace wholesale when the auth API lands. |
| **Chat (UI only)** | `ChatContext` | `useState` (in-memory, not persisted) | `conversations`, `unreadTotal`, `markRead(id)`, `sendMessage(id, text)`. Seeded from `data/conversations.js`. The single unread source for the chat page, the sidebar badge and the public header's chat icon. Sent messages live until reload — this is the seam a messaging API replaces. |
| **UI-local state** | plain `useState` in each component | in-memory only | Dropdown open/closed (district, language, sort, filter panel — all via `useDismiss`), gallery active image index, chat modal messages, mobile menu open/closed, share-copied toast, per-page `loading` flags. |

Filters/apartments are **not** in Context globally — each page (Home,
Wishlist) derives its own visible list by calling `filterApartments()` +
`sortApartments()` against the static `APARTMENTS` array using whatever
filter/sort state it owns. There's no cross-page cache or shared "current
result set."

---

## 9. Design System

Defined once, as Tailwind v4 `@theme` tokens in `frontend/src/index.css`
(no separate design-token file, no Figma):

**Colors** (exact hex values in code):

| Token | Hex |
|---|---|
| `--color-background` | `#f8fafc` |
| `--color-surface` | `#ffffff` |
| `--color-surface-secondary` | `#f1f5f9` |
| `--color-text-primary` | `#0f172a` |
| `--color-text-secondary` | `#334155` |
| `--color-text-muted` | `#64748b` |
| `--color-border` | `#e2e8f0` |
| `--color-primary` | `#059669` |
| `--color-primary-hover` | `#047857` |
| `--color-primary-light` | `#d1fae5` |
| `--color-error` | `#e11d48` |
| `--color-warning` | `#f59e0b` |

**Typography:** one font, `--font-sans: "Inter", ui-sans-serif, system-ui,
sans-serif`, loaded via Google Fonts `<link>` tags in `index.html`. Sizes
are plain Tailwind scale classes (`text-xs` → `text-2xl`) — no custom type
scale defined.

**Spacing:** Tailwind's default 4px-based scale throughout
(`gap-2`/`p-3`/`py-8`, etc.); the page container is a fixed
`max-w-336` (1344px, i.e. `calc(var(--spacing) * 336)`).

**Border radius:** `rounded-md` (buttons, inputs, chips), `rounded-lg`
(popovers, filter option buttons), `rounded-xl` (apartment card, image
gallery, details skeleton) — restrained, no `rounded-full` except on
circular icon buttons and the wishlist heart button/avatar-style elements.

**Buttons:** primary = `bg-primary` + white text + `hover:bg-primary-hover`;
secondary = `border border-border bg-surface` + `hover:bg-surface-secondary`;
all have `focus-visible:ring-2 focus-visible:ring-primary` for keyboard
focus, and `transition-colors`/`transition-all` on hover-affected props.

**Cards:** `rounded-xl border border-border bg-surface shadow-sm
hover:shadow-md transition-shadow` (apartment card); a lighter variant
(`rounded-lg border border-border bg-surface`, hover adds
`border-primary/30 bg-surface-secondary shadow-sm`, 200ms transition, no
scale) is used for the details-page fact tiles.

**Wishlist "liquid-glass" button:** `bg-white/70 backdrop-blur-md ring-1
ring-white/60 shadow-[0_2px_10px_rgba(15,23,42,0.10)]`, `hover:scale-105
active:scale-95`, switching to `bg-primary-light/80 ring-primary/30
text-primary` when saved. Used identically on the card, the details page,
and the empty-wishlist illustration.

**Inputs:** `border border-border bg-surface rounded-md`,
`focus:ring-2 focus:ring-primary/40`.

**Hover states:** consistently `hover:bg-surface-secondary` for
secondary/neutral controls, `hover:text-primary` for text links,
`hover:shadow-md`/`hover:border-primary/30` for cards — always paired with
a `transition-*` class (150–250ms), never an abrupt color/shadow snap.

**Responsive behavior:** mobile-first Tailwind breakpoints, but **not** a
single global cutover — different pieces intentionally use different
breakpoints because they were tuned against real content-overflow testing:
- Apartment grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (1/2/4 columns).
- Header: full single-row desktop layout only at `xl:` (1280px) — a compact
  logo+language+hamburger layout with its own full-width search row covers
  everything below that, because the full row was measured to not fit at
  1024px no matter how tight the spacing got.
- Search bar's keyword input/submit button use a custom `min-[412px]:`
  breakpoint specifically so the submit button becomes icon-only below
  412px (freeing width for the keyword input) and shows "Qidirish" text
  above it.
- Apartment Details: 2-column (`lg:grid-cols-[1fr_400px]`) gallery+info
  layout collapses to stacked below `lg:`, with a `lg:hidden` sticky
  bottom Call/Message bar on mobile/tablet.

---

## 10. External Dependencies

From `frontend/package.json`:

| Package | Why |
|---|---|
| `react`, `react-dom` (^19) | UI framework |
| `react-router-dom` (^7) | Client-side routing |
| `tailwindcss` + `@tailwindcss/vite` (v4) | Styling, compiled via the Vite plugin (no separate PostCSS config) |
| `lucide-react` | Tree-shakeable icon set (map/pin/gallery/amenity/chat icons); added specifically when icon needs grew past the project's hand-rolled inline SVGs |
| `leaflet` | Map rendering on `/map` (tiles, markers, polygons, controls) — used directly via `useRef`/`useEffect`, deliberately **not** `react-leaflet`, to avoid a React 19 peer-dependency conflict (`leaflet` itself has zero peer deps) |
| `vite` (dev) | Dev server + build |
| `@vitejs/plugin-react` (dev) | React Fast Refresh / JSX transform for Vite |
| `oxlint` (dev) | Linter (`npm run lint`) — fast Rust-based ESLint alternative, config in `.oxlintrc.json` |

No state management library, no HTTP client, no CSS-in-JS, no UI component
library, no testing framework installed. This is deliberate per CLAUDE.md
("do not add unnecessary dependencies").

---

## 11. Environment Variables

**None are currently used.** There is no `.env` file, no `import.meta.env.*`
reference anywhere in the frontend code, and no backend to have its own
environment configuration. `.gitignore` already reserves `.env`, `.env.local`,
and `*.env` for when they're needed (e.g. a future map provider API key or
backend database URL) — no secrets exist in the repository today.

---

## 12. Current Features

- [x] Home page (header, search, filters, sort, apartment grid, footer)
- [x] District-based search (custom searchable popover, single source of
      district data)
- [x] Keyword search (street/metro/landmark matching against mock data)
- [x] Filters: price, rooms, area, floor, furnished (+ district on Wishlist)
- [x] Sort: newest, cheapest, most expensive, largest/smallest area (+
      saved-newest/oldest on Wishlist)
- [x] Apartment cards (image, price, title, location, specs, posted time,
      wishlist button, "view on map" action, opens details in a new tab)
- [x] Wishlist (add/remove, persisted to `localStorage`, own filter/sort,
      dedicated empty and filtered-empty states)
- [x] Apartment Details page (image gallery, price, facts, description,
      amenities, owner info, call/message actions, similar-apartments
      recommendations)
- [x] Mock "chat" UI on the details page (no backend)
- [x] Responsive header/footer/grid/details across desktop/tablet/mobile
- [x] uz/ru/en localization (default uz), persisted language choice
- [x] Light/Dark theme (default light, persisted; toggle in both headers plus a
      light/dark/system chooser in account Settings)
- [x] Loading skeletons and empty/not-found states throughout
- [x] Map (`/map`): Leaflet tiles/markers, district boundary highlight +
      dimmed surroundings, existing filters reused (no second filtering
      system), current-location geolocation button with client-side
      "nearby apartments" (~3 km, haversine), `?apartment=:id` deep link
      into the shared apartment preview
- [ ] Address/street/metro text search on the Map page (explicitly deferred
      — district + filters only for the Map MVP)
- [x] Authentication **UI** (`/login`, `/register` forms with client-side
      validation and full uz/ru/en localization)
- [ ] Authentication **behaviour** (no session, no token, no protected
      routes, no role checks — the forms do not talk to anything yet)
- [ ] Go backend / REST API (no backend code exists)
- [ ] PostgreSQL / any database
- [x] User account **UI** (`/dashboard` shell, sidebar/drawer navigation,
      profile overview, routed sections for listings/chats/settings and
      `/create-listing`)
- [ ] User account **behaviour** (mock user, unprotected routes, placeholder
      stats, no editing)
- [ ] Apartment CRUD (owner dashboard is a placeholder)
- [ ] Admin moderation (admin page is a placeholder)
- [ ] Real image upload/storage (images are hardcoded Unsplash URLs)

---

## 13. Known Limitations

- **All apartment data is static and in-memory.** `APARTMENTS` is a
  hardcoded array bundled into the JS at build time. There is no
  create/update/delete capability anywhere — "Owner Dashboard" is a bare
  placeholder page.
- **Wishlist is the only persisted state**, and it's persisted to
  `localStorage`, not a server — it's per-browser, not per-account, and
  will not survive across devices or a cleared cache.
- **No authentication exists.** Anyone can "own" a wishlist (it's just
  local storage); there's no login, no session, no user identity anywhere
  in the app.
- **"Xabar yozish" (Message) is a mock chat UI only** (`ContactChatModal`).
  Sent messages live in local component state and vanish when the modal
  closes — there's no WebSocket, no backend, no persistence, and messages
  aren't actually delivered anywhere. This is intentional/scoped, not a bug.
- **"Qo'ng'iroq qilish" (Call) is a plain `tel:` link** — no call-tracking,
  no backend involvement.
- **District boundaries are simplified, not survey-grade.** `data/districts.geo.json`'s
  polygons are real OpenStreetMap administrative relations, Douglas-Peucker
  simplified (~30m tolerance) for bundle size — fine for a visual highlight
  and accurate to the real district shape, not for precise cadastral use.
- **"Nearby apartments" is a client-side MVP.** `utils/geo.js` computes
  straight-line (haversine) distance against the full in-memory
  `APARTMENTS` array on every geolocation success — fine at 10 mock
  listings, would need to move to a backend geo-query (e.g. PostGIS) at
  real scale. The util is intentionally isolated so that move doesn't
  touch `MapPage`/`ApartmentMap`.
- **Search is substring matching against a precomputed `searchText`
  field**, not a real search index — fine for 10 mock listings, would not
  scale to a real catalog without a backend search implementation.
- **Apartment titles are only really localized via the locale files**
  (`apartmentTitle.<id>`), not the data model itself — the `title` field
  on each apartment object is Uzbek-only and effectively dead for display
  purposes. A real backend would need a cleaner i18n strategy per listing.
- **No tests.** No test framework is installed; verification throughout
  this project has been manual dev-server checks (and ad hoc Playwright
  scripts during development that are deleted afterward, not checked in).
- **No error boundaries** anywhere in the React tree — an unexpected
  runtime error in any component will produce React's default white
  screen rather than a graceful fallback.
- **Images are external Unsplash URLs** with no fallback if they fail to
  load or Unsplash is unreachable, and no real upload pipeline.

---

## 14. Planned Architecture — PLANNED / NOT IMPLEMENTED

Everything in this section describes **intended future work**, per
CLAUDE.md. None of it exists in the codebase yet. It's included here only
to explain how upcoming features are expected to slot into what's already
built, so implementation choices made now (e.g. `latitude`/`longitude`
already on apartments, `filterApartments`/`sortApartments` being pure
functions, `FilterBar`/`SortDropdown` being props-controlled) don't have to
be reworked later.

### Go API
`Router → Handler → Service → Repository → PostgreSQL`, REST under
`/api/v1/...`. Once built, `frontend/src/data/apartments.js` and
`data/districts.js` get replaced by `fetch` calls (likely via a new
`src/services/` folder), but `filterApartments`/`sortApartments`'s
*signatures* are written generically enough that query-building for
`GET /api/v1/apartments?district=&keyword=&...` can mirror them closely.
`getSimilarApartments` is deliberately a pure `(apartment, apartments[],
limit)` function so it can be swapped for
`GET /apartments/:id/recommendations` without touching call sites.

### PostgreSQL
Entities per CLAUDE.md: `User`, `District`, `Apartment`, `ApartmentImage`,
`Wishlist`, `WishlistItem`, `Amenity`, `ApartmentAmenity`, `Report`,
`RefreshToken` — created incrementally as each feature is built, not all
up front.

### Authentication / JWT
The `/login` and `/register` **forms already exist** (see Section 6) with
required-field, email-format and password-match validation, but they are
deliberately inert: submitting a valid form only renders a "backend pending"
note — no request, no token, no session, no redirect. Wiring them up means
replacing that branch with a call to `POST /api/v1/auth/login|register` and
storing the returned session. `WishlistContext` and any future "my listings"
state would then move from `localStorage` to being scoped by the
authenticated user id.

### Wishlist persistence (server-side)
Today: `localStorage` only. Future: `POST/DELETE /api/v1/wishlist/:apartmentId`
+ `GET /api/v1/wishlist`, with `WishlistContext`'s `toggleWishlist`/`isSaved`
API shape staying the same so `ApartmentCard` and both list pages don't need
to change — only the Context's internals swap from `localStorage` to API
calls.

### Apartment CRUD
Owner Dashboard (`/owner`) is currently a placeholder. Building it means a
real form for the fields already listed in CLAUDE.md's "Owner Listings"
section (most of which already exist on the mock `Apartment` shape:
title, price, district, address, lat/lng, rooms, area, floor, totalFloors,
furnished, amenities, images) plus a `status` field
(`DRAFT`/`PENDING`/`APPROVED`/`REJECTED`) that doesn't exist yet.
