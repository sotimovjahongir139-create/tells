# AI Sales Call Analyzer

Standalone app that pulls Asadbek's sales calls from amoCRM, sends the recordings to
Gemini for transcription and analysis, scores the calls, and shows daily/weekly/monthly
results in an Uzbek-language dashboard.

This is a completely separate project from any existing CRM system on this machine —
its own folder, backend, frontend, database, and environment variables. Nothing in the
existing CRM was modified to build this.

## Architecture

```
ai-sales-call-analyzer/
  backend/     Node.js + Express + Prisma + PostgreSQL API
  frontend/    React + Vite dashboard (Uzbek Latin UI)
```

Pipeline: `amoCRM (call metadata) -> local Postgres -> dashboard` and, per call on
demand, `recording URL -> Gemini -> transcript + analysis -> Postgres -> call detail page`.

Dashboard statistics are always computed from the local database, never live from
amoCRM, so daily/weekly/monthly numbers stay fast and consistent.

## Known limitation: live call recordings

**Read this before expecting new calls to show up analyzable.**

amoCRM's API was investigated directly (read-only) against the real account. Findings:

- Calls arrive in amoCRM as notes (`note_type: call_in` / `call_out`) on leads and
  contacts, not through a dedicated "calls" endpoint.
- An old **Moi Zvonki** (moizvonki.ru) telephony integration correctly attributed calls
  to Asadbek and included real recording URLs — but is inactive for new calls (all such
  calls found were from **April–May 2024**, plus a single isolated call from **March
  2026**, whose recording is a moizvonki.ru URL too — that integration may not be fully
  dead, worth checking).
- Calls from mid-2025 onward mostly go through a different, unidentified telephony
  source. Those notes have `params.link: null` (no recording URL exposed via amoCRM)
  and `created_by: 0` with `responsible_user_id` pointing at the account admin, not
  Asadbek — amoCRM's API gives no reliable way to attribute them to him specifically.
- amoCRM's API does not expose which private/custom integration is posting these notes
  (the marketplace `/widgets` endpoint doesn't list it) — identifying it requires
  checking **amoCRM's web UI → Settings → Integrations**, or asking whoever manages the
  phone/softphone system Asadbek's team actually dials from.

Until that current telephony provider is identified and its recording API (if any) is
wired in, `sync` will keep pulling call **metadata** faithfully, but will not create
new Call rows for anything it can't attribute with real evidence (see
`backend/src/services/sync.service.js` — `belongsToSalesperson`). This is deliberate:
misattributing another rep's calls to Asadbek would corrupt his AI scores.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Backend setup

```bash
cd backend
npm install
cp .env.example .env   # fill in real values, see below
npx prisma migrate dev
node scripts/seed.js   # creates the admin user + Asadbek salesperson record
npm run dev            # starts on PORT (default 4000)
```

### Environment variables (`backend/.env`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string for this app's **own** database |
| `JWT_SECRET` | random secret, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `AMOCRM_DOMAIN` | e.g. `yourcompany.amocrm.ru` |
| `AMOCRM_ACCESS_TOKEN` | long-lived token, read-only usage only (GET requests) |
| `GEMINI_API_KEY` | server-side only, never sent to the frontend |
| `GEMINI_MODEL` | e.g. `gemini-2.5-flash` |
| `TIMEZONE` | `Asia/Tashkent` |
| `SYNC_INTERVAL_MINUTES` | how often the background amoCRM sync runs |
| `ASADBEK_AMOCRM_USER_ID` | Asadbek's numeric amoCRM user id |

### Seeding the admin login

```bash
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD='YourPassword!' node scripts/seed.js
```

Re-running the seed script updates the password for an existing username.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_BACKEND_URL if backend isn't on localhost:4000
npm run dev            # starts on port 5173
```

Open `http://localhost:5173` — you'll land on the login page first.

## Production build

```bash
cd frontend && npm run build   # outputs frontend/dist, serve as static files
cd backend && npm start        # run behind a process manager (pm2, systemd, etc.)
```

Point `FRONTEND_URL` (backend) and `VITE_BACKEND_URL` (frontend) at your real domains,
and run `npx prisma migrate deploy` instead of `migrate dev` in production.

## API summary

- `POST /api/auth/login`
- `GET /api/dashboard?period=daily|weekly|monthly&date=YYYY-MM-DD`
- `GET /api/calls`, `GET /api/calls/:id`
- `POST /api/calls/:id/analyze` — sends the recording to Gemini (only when clicked, not automatic — controls API cost)
- `POST /api/sync/amocrm` — manual sync trigger (also runs automatically on `SYNC_INTERVAL_MINUTES`)
- `GET /api/health`

All routes except `/auth/login` and `/health` require a `Bearer` JWT.
