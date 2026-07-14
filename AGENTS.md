# AGENTS.md

## Cursor Cloud specific instructions

### Project layout
- The actual app lives in the `Proyecto Vibe/` subdirectory (note the space — always quote the path). It is an npm multi-package project: root (`Proyecto Vibe/package.json`) + `backend/` (Express API) + `frontend/` (SvelteKit).
- Node 20 is the target (`frontend/.node-version` = `20`); Node 22 also works fine for dev.

### Services & how to run them
Run all commands from `Proyecto Vibe/` (see `README.md` and root `package.json` scripts).
- Backend API (`http://localhost:3000`): `npm run dev:backend` (needs `backend/.env`).
- Frontend (`http://localhost:5173`): `npm run dev:frontend` (needs `frontend/.env`; Vite proxies `/api` → `localhost:3000`).
- `.env` files are gitignored and required: dev/seed scripts load them via `node --env-file=.env`, so a missing `backend/.env` makes those scripts fail immediately. Copy from the `.env.example` files.

### MongoDB (required, non-obvious)
- The backend hard-fails on boot if `MONGODB_URI` is unset (`config/db.js` throws → `process.exit(1)`). Nothing beyond `GET /api/salud` works without a DB.
- MongoDB 8 is installed locally. systemd is NOT available in this VM, so start it manually instead of `systemctl`:
  `mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017` (run it in a tmux/background session).
- For local dev, point `backend/.env` at `MONGODB_URI=mongodb://127.0.0.1:27017/admin-system`.
- Seed data: from `backend/`, `npm run seed` (admin user), plus `seed:mapas` / `seed:colaboradores`.

### Clerk (external SaaS — gates all authenticated flows)
- Auth is handled by Clerk. Real keys are required for login and every protected API route (`/api/auth`, `/api/usuarios`, `/api/dashboard`, `/api/excel`, `/api/mapas`, `/api/colaboradores`, `/api/nomina`, `/api/flujo`).
- Without valid keys (and network egress to `clerk.com`): the landing page (`/`) still renders, but `/sign-in` renders blank (Clerk JS fails to load) and protected endpoints return 401/500. Set `backend/.env` `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` and `frontend/.env` `PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_...`) to enable auth.

### Resend (optional)
- Only used for outbound email (welcome mail on signup, dashboard Excel report). The client is lazy-initialized, so the app runs fine without `RESEND_API_KEY`.

### Lint / test / build
- No linter and no automated test suite exist anywhere in the repo.
- The only automated check is frontend type-checking: from `frontend/`, `npm run check` (`svelte-kit sync && svelte-check`). It currently reports 2 pre-existing errors referencing `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `src/routes/+layout.svelte` and `src/routes/+page.svelte` — these are pre-existing in the repo, not caused by setup.
- Frontend production build: from `frontend/`, `npm run build` (static output in `build/`). Backend has no build step (`npm start` runs `src/index.js`).
