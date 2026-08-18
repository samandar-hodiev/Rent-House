# Map page (`/map`)

Frontend-only (mock data), vanilla Leaflet — not `react-leaflet`, chosen
specifically to avoid a React 19 peer-dependency conflict (`leaflet` itself
has zero peer deps). This doc covers the Map page only; see
`PROJECT_ARCHITECTURE.md` for the rest of the app.

## Components

| File | Responsibility |
|---|---|
| `pages/MapPage.jsx` | Owns all Map-page state (selected apartment, geolocation status/error, user location) and layout. Derives `visibleApartments` from the shared `SearchContext` + `filterApartments`. Renders the compact glass control bar and the apartment preview; delegates actual map rendering to `ApartmentMap`. |
| `components/ApartmentMap.jsx` | Thin, imperative Leaflet wrapper. Owns the `L.map` instance and all Leaflet layers (tiles, markers, district boundary/mask, user-location dot). Knows nothing about filters, geolocation UI, or routing — it just reflects whatever props it's given. |
| `components/MapApartmentPreview.jsx` | The floating/bottom-sheet card shown for the selected apartment. Reused for marker clicks and the `?apartment=` deep link — one component, two `variant`s (`floating` | `sheet`), no duplicate details view. |
| `components/FilterBar.jsx` / `FilterPanel.jsx` | Same shared, props-controlled filter UI used on Home/Wishlist. Map passes `glass` (see below) but the filtering logic itself is identical everywhere. |
| `utils/filterApartments.js` | Single filtering pipeline — district + filters. No map-specific filtering exists. |
| `utils/geo.js` | Isolated `getDistanceKm` (haversine) + `getNearbyApartments(apartments, userLocation, radiusKm)`, used only for the "nearby" status text/marker highlight. |
| `data/districts.js` | `DISTRICTS`: `{ id, name, latitude, longitude, boundary }`, where `boundary` is a `[lat, lng][]` polygon ring. |

## State ownership

All Map-page state lives in `MapPage`, not in `ApartmentMap` or Context:

- `districtId`, `filters` — from the existing `SearchContext` (shared with Home).
- `selectedApartment` — which marker/deep-link apartment is previewed.
- `userLocation`, `locationStatus` (`idle | locating | granted | error`), `locationErrorKey` — the geolocation flow.
- `leafletMapRef` — a plain `useRef`, populated by `ApartmentMap` via its `mapRef` prop so `MapPage`'s own zoom buttons can call `map.zoomIn()`/`zoomOut()` without Leaflet's default zoom control.

`ApartmentMap` only holds *internal* refs (the `L.map` instance, layer groups) — it is otherwise a controlled component driven entirely by props (`apartments`, `selectedDistrict`, `focusApartmentId`, `userLocation`, `nearbyApartmentIds`, `onMarkerClick`).

## Compact glass control bar

One shared bar directly under the Header (`absolute inset-x-0 top-0 z-10` inside the map's `relative` container), split by `justify-between`:

- **Left:** `FilterBar` (with `glass` prop) + a result-count pill.
- **Right:** My Location, Zoom In, Zoom Out — plain React buttons, not Leaflet controls, so they can live in the same bar as the filters. They call `leafletMapRef.current.zoomIn()/.zoomOut()` and the existing `handleLocateRequest`.

Style: `bg-white/80` + `backdrop-blur-md` (~12px) + `border-white/50` + a soft shadow — the map stays visible through it. `FilterBar`'s `glass` variant intentionally has **no border/blur/shadow of its own** (`border-transparent bg-white/55`) since it's nested inside the bar's own glass surface; giving it a second full glass treatment would double up the effect. A secondary small pill (locating/nearby-count/error status) renders in its own row below the bar only when there's something to show, so the primary bar's height stays fixed regardless of geolocation state.

## Z-index / stacking

The dropdown-under-map bug (Leaflet's own `.leaflet-top`/`.leaflet-bottom` panes ship with `z-index: 1000`) is fixed at the source, not by raising other z-indexes further:

- `ApartmentMap`'s root div is `absolute inset-0 z-0` — an **explicit** `z-0` (not just `position`) so it establishes its own stacking context and *contains* Leaflet's internal z-1000 panes instead of letting them compete in the document root against `Header`'s `sticky z-30`.
- The control bar is `z-10` (above the map, below nothing else that matters) and the apartment preview overlay is `z-20`. Both sit comfortably under `Header`'s `z-30`, so the district dropdown in the Header always renders on top.
- `FilterPanel`'s own dropdown uses `z-40`, but that's scoped *inside* the bar's local stacking context, not competing globally — it only needs to beat the bar and the map, which it does.

## District selection

`data/districts.js` boundaries are real (simplified) OpenStreetMap
administrative-boundary polygons — not a circle/radius. `ApartmentMap`
renders two `L.polygon` layers when a district is selected:

1. A world-covering rectangle with the district boundary as a hole (SVG
   even-odd fill), semi-transparent dark fill — dims everything outside the
   district without hiding geographic context.
2. The boundary itself, outlined in `--color-primary` green, no fill.

Markers render in Leaflet's `markerPane` (above the vector `overlayPane`),
so the dim mask never obscures them. Apartments outside the district are
filtered out upstream by `filterApartments` (same pipeline as Home) — they
aren't hidden via CSS, they're just absent from `visibleApartments`.

If real per-district GeoJSON (e.g. from a future backend) becomes
available, only `data/districts.js`'s `boundary` field needs to change —
`ApartmentMap` already consumes it as a plain `[lat, lng][]` ring and has
no other coupling to how that data was produced.

## Filter flow

No second filtering system. `MapPage` calls the exact same
`filterApartments(APARTMENTS, { districtId, keyword: '', filters })` used
by Home, with `keyword` hard-disabled (see "Header search" below). The
resulting array drives both the marker list and the result-count pill, so
selecting a district or changing a filter narrows both identically.

## Apartment marker + preview flow

1. Marker click → `onMarkerClick(apartment)` → `MapPage` sets `selectedApartment`.
2. `MapApartmentPreview` renders — `variant="floating"` (centered card, ~400px,
   desktop/tablet) or `variant="sheet"` (bottom sheet, mobile) via Tailwind's
   `sm:` breakpoint, both backed by the same component/markup.
3. "Batafsil ko'rish" navigates to the existing `apartmentDetailsPath(id)` →
   `ApartmentDetailsPage`. No duplicate details view exists on the Map page.

## Deep link (`?apartment=:id`, "Xaritada ko'rish")

`ApartmentMap` reads `focusApartmentId` once (guarded by a
`hasFocusedInitialApartment` ref so it doesn't refire on re-renders),
centers the map on that apartment, and calls the same `onMarkerClick` a
real marker click would — so it opens the same preview component, not a
separate code path.

## My Location / geolocation flow

1. User clicks the location button in the control bar → `handleLocateRequest`.
2. `navigator.geolocation.getCurrentPosition()` is called directly — no
   custom permission UI, and only on click (never automatically).
3. **Success:** `userLocation` is set and passed to `ApartmentMap`, which
   draws a small pulsing blue dot (+ accuracy circle if `accuracy` is
   present) and flies to it. `getNearbyApartments` (haversine, ~3 km)
   computes which of the already-filtered apartments are nearby; those
   markers get a subtle blue ring, and a status pill shows the count.
4. **Denied / unavailable / timeout / unsupported:** mapped to a
   `map.location*` locale key and shown in the same status pill — no crash,
   no raw browser error, no repeated auto-prompting.

The coordinates never leave the browser (no backend call) — this is
explicitly a client-side MVP; `utils/geo.js` is isolated so the same
distance/radius logic can move to a backend query later without touching
`MapPage` or `ApartmentMap`.

## Header search on `/map`

`SearchBar.jsx` disables the keyword input/submit button on this route
(`isKeywordSearchDisabled`) — it stays visually present for layout
consistency with Home, but district + filters are the only Map search
mechanism. This is unchanged by this pass.

## Layout / height

`RootLayout`'s `<main>` is `flex flex-1 flex-col` and `MapPage`'s root is
`flex-1` (not `h-full`/`h-[80vh]`) so the map exactly fills the space
between Header and Footer with no gap. This matters because CSS percentage
heights (`h-full`) don't resolve against an ancestor whose height comes
from `flex-grow` rather than an explicit `height` — using `flex-1` end to
end avoids that trap.

## Responsive behavior

- **Desktop/tablet (`sm:` and up):** one-row glass bar (`flex-wrap` as a
  safety net, not the norm); apartment preview is the centered floating card.
- **Mobile:** same bar (buttons stay compact/`size-8`, wraps only if it has
  to); apartment preview becomes a bottom sheet anchored to the bottom of
  the map area (above the Footer, not the raw viewport edge — the Footer
  stays reachable, not covered).
