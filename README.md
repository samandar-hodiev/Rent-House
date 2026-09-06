# RentHouse

RentHouse helps users find apartments for rent in Tashkent, Uzbekistan —
district-based search, keyword search,

filters, map discovery, wishlist
owner listings, and moderation.

Frontend: React + Vite + Tailwind CSS (JavaScript).
Backend: Go, PostgreSQL, REST API.

See [CLAUDE.md](./CLAUDE.md) for full project context and conventions.

Project is built incrementally, phase by phase — see the Phases section in
CLAUDE.md for the current roadmap.!

## Running with Docker

```
make env   # copy .env.example and backend/.env.example to .env files
make up    # build and start postgres, the api, and the frontend
```

Then open http://localhost:3000. The API is also reachable directly at
http://localhost:8080 for debugging. `make down` stops the stack;
`make logs` follows the API and frontend; `make ps` shows what's running.

Fill in `backend/.env` before `make up` if you need real email/SMS delivery
or an admin bootstrap account — see the comments in `backend/.env.example`.
Without it the server still starts, using the `dev` providers that log
verification codes instead of sending them.

See the [Makefile](./Makefile) for every other command (`make migrate`,
`make seed`, `make admin`, `make clean`).
