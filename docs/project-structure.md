# Project structure

The full directory tree, as it exists in the repository today (generated
directly from the file system — `node_modules/`, `dist/`, `uploads/`, and
`.git/` are excluded as build/dependency/runtime output, not source). For
what each file actually does, see [`file-guide.md`](./file-guide.md) (or
[`file-guide.uz.md`](./file-guide.uz.md) for the Uzbek version) — this file
is the map, that one is the legend.

```
Rent-House/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/                         Go API — Gin, GORM, PostgreSQL
│   ├── cmd/                         The 4 runnable binaries
│   │   ├── admin/main.go               creates the first owner account
│   │   ├── migrate/main.go             applies/rolls back schema migrations
│   │   ├── seed/main.go                inserts reference data (districts, amenities)
│   │   └── server/main.go              the actual HTTP API
│   ├── internal/                    Application code (not importable outside this module)
│   │   ├── config/                     environment variable loading + validation
│   │   ├── database/                   PostgreSQL connection + migration runner
│   │   ├── dto/                        request/response JSON shapes
│   │   ├── handler/                    HTTP layer — bind, delegate, respond
│   │   ├── middleware/                 auth, CORS, rate limiting, security headers
│   │   ├── models/                     GORM entities (the schema, described for Go)
│   │   ├── notify/                     email/SMS delivery (Resend, SMTP, Eskiz)
│   │   ├── otp/                        one-time verification codes
│   │   ├── realtime/                   the WebSocket chat hub
│   │   ├── repository/                 database queries only, no business rules
│   │   ├── seed/                       reference-data seeding logic
│   │   ├── service/                    business rules — the layer between handler and repository
│   │   ├── storage/                    uploaded-file storage abstraction
│   │   └── token/                      JWT minting/verification
│   ├── migrations/                  29 versioned schema changes, .up.sql + .down.sql pairs
│   ├── pkg/                         Small, dependency-free shared packages
│   │   ├── logger/                     Infof/Errorf/Fatalf
│   │   └── response/                   the shared JSON envelope shape
│   ├── .env / .env.example          Runtime config (gitignored / template)
│   ├── Dockerfile
│   ├── go.mod / go.sum
│   └── README.md
├── docs/                            Documentation (this file lives here too)
│   ├── file-guide.md                   what every file does (English)
│   ├── file-guide.uz.md                what every file does (Uzbek)
│   ├── project-structure.md            this file
│   ├── map-page.md                     deep dive on the Map page specifically
│   ├── review-report.md                pre-deployment audit findings (English)
│   └── review-report.uz.md             pre-deployment audit findings (Uzbek)
├── frontend/                        React + Vite + Tailwind CSS (JavaScript)
│   ├── public/                      Static assets served as-is (currently empty)
│   ├── src/
│   │   ├── assets/                     (currently empty)
│   │   ├── components/              Reusable, mostly presentational UI
│   │   │   ├── admin/                  admin-dashboard-only components
│   │   │   ├── auth/                   register/login screen pieces
│   │   │   ├── chat/                   the chat feature's UI
│   │   │   ├── dashboard/              signed-in user dashboard pieces
│   │   │   ├── listing/                create/edit-listing form pieces
│   │   │   └── *.jsx                   shared across the public site
│   │   ├── context/                 React Context — cross-page client state
│   │   ├── data/                    Static reference data + form/status definitions
│   │   ├── hooks/                   Shared logic, no UI of its own
│   │   ├── layouts/                 Page shells (header+outlet+footer)
│   │   ├── locales/                 uz/ru/en translation dictionaries
│   │   ├── pages/                   One file per public/dashboard route
│   │   │   └── admin/                  one file per admin-dashboard route
│   │   ├── routes/                  Route-path constants
│   │   ├── services/                The only code that calls the backend API
│   │   ├── test/                    Test environment setup
│   │   ├── utils/                   Shared, UI-free logic
│   │   ├── App.jsx                  Route table + provider tree
│   │   ├── index.css                Tailwind import + design tokens
│   │   └── main.jsx                 React DOM render entry point
│   ├── .env.example / .env.local    Runtime config (template / local dev)
│   ├── Dockerfile
│   ├── nginx.conf                   Production static-file + /api reverse-proxy config
│   ├── package.json / package-lock.json
│   └── vite.config.js
├── .env / .env.example              Docker Compose-level config (template / local)
├── CLAUDE.md                        Persistent product/convention rules — read this first
├── docker-compose.yml               Full-stack local/deployment orchestration
├── Makefile                         `make env`, `make up`, `make down`, ...
├── PROJECT_ARCHITECTURE.md          Early-project architecture snapshot (now outdated — see file-guide.md instead)
└── README.md                        One-paragraph project pointer
```

## Orientation

- **Reading order for a newcomer:** `CLAUDE.md` (what this product is and the
  rules for building it) → this file (where things live) → `file-guide.md`
  (what any specific file does) → the code itself.
- **Backend layering:** `cmd/server/main.go` wires everything together at
  startup. A request flows `Router → Handler → Service → Repository →
  PostgreSQL`. Business rules live only in `internal/service/`; handlers and
  repositories are deliberately "dumb".
- **Frontend data flow:** `pages/` own state and compose `components/`;
  `services/` is the only layer allowed to call `fetch`; `context/` holds
  state that spans more than one page (auth session, wishlist, chat); `data/`
  and `utils/` have no UI and no side effects of their own.
- **Two parallel admin systems:** the public marketplace (`users`,
  `AuthContext`, `authApi.js`) and the admin dashboard (`admins`,
  `AdminAuthContext`, `adminApi.js`) are intentionally separate accounts,
  tokens, and API namespaces throughout both the backend and the frontend —
  never shared, so a bug in one can't leak into the other.
