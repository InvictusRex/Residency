# Residency

A society maintenance tracker. Residents file complaints with photos, watch every status change, and read society notices. Admins triage the queue, set priorities, post notices, and keep an eye on what is overdue. Everyone stays in the loop through a notice board and email updates.

The problem it solves: apartment societies handle a steady stream of maintenance complaints, and without a proper system the admin has no way to see what is pending, what is overdue, or which issues keep coming back. Spreadsheets and WhatsApp threads do not cut it. Residency gives every complaint a clear, auditable lifecycle, from filing to resolution, and it makes sure nothing falls through the cracks.

Two roles use the platform:

- **Residents** register, log in, file complaints (category, description, optional photo), track the status history of their own complaints, and read notices.
- **Admins** manage the complaint queue, filter and sort it, set priorities, move complaints through the status lifecycle, post important and regular notices, configure the overdue threshold, manage residents and categories, and watch the numbers on a live dashboard.

## Features

- **Registration and login.** Secure accounts with password policy checks, backed by the database.
- **Persistent sessions.** Access tokens last 10 minutes; refresh tokens last 7 days. The frontend refreshes silently when an access token expires, so reloading the page never logs you out.
- **Complaint filing.** A category, a description (5 to 5000 characters), and an optional photo.
- **Categories.** Admin-managed taxonomy (Plumbing, Electrical, Security, Cleaning, Other by default). Categories are soft-deleted so old complaints keep their references.
- **Photo uploads.** JPEG, PNG, or WebP. Validated by content type, file extension, and magic bytes, capped at 5 MB, stored on disk, and served only through an authenticated endpoint.
- **Complaint tracking.** Residents see only their own complaints, with live status, priority, category, and dates. Every complaint keeps a complete, immutable history.
- **Status history.** Every lifecycle event is appended to an append-only `complaint_history` table with the status, the actor, a timestamp, and an optional note. Admins can also post progress notes without changing status.
- **Priorities.** Low, Medium, High. Persisted and used for ordering, not just a badge.
- **Overdue detection.** Computed on the fly against an admin-configurable threshold. Overdue complaints surface at the top of the admin view.
- **Admin dashboard.** Live totals by status, by category, and an overdue count, aggregated from the database. No hardcoded numbers.
- **Notice board.** Admins post notices; important notices are pinned to the top and emailed to every active resident.
- **Email notifications.** Status changes email the owning resident; important notices fan out to all active residents. SMTP-based and Resend-ready.
- **Resident management.** Admins list, search, and activate or deactivate resident accounts.
- **Self-service account changes.** Residents can update their name, email, or password. Changing email or password requires the current password.
- **Security.** Role-based authorization is enforced on the API, not just hidden in the UI. Passwords are hashed with argon2. Auth endpoints are rate limited. CORS is restricted to configured origins. No secrets live in the repository.

## System Architecture

A monorepo with a Python/FastAPI backend, a Next.js frontend, and PostgreSQL. The backend is layered: thin HTTP routes delegate to a service layer that owns the business rules, and SQLAlchemy models define the schema. Pydantic schemas validate every request and shape every response. Two swappable abstractions, `StorageService` (photos) and `NotificationService` (email), keep infrastructure concerns out of the domain logic.

```mermaid
flowchart TD
    FE["Next.js Frontend (port 3000)"] --> API["FastAPI REST API /api/v1"]
    API --> SVC["Service Layer (business rules)"]
    SVC --> DB[("PostgreSQL")]
    SVC --> PHOTO["Photo Storage (uploads/ dir)"]
    SVC --> MAIL["Email / Resend SMTP"]
    AUTH["JWT Auth (access + refresh tokens)"] --> API
    FE --> AUTH
```

- **Frontend.** Next.js 16 App Router, TypeScript, Tailwind v4, TanStack Query. It calls the backend REST API directly. No mocks, no client-side fake data.
- **Backend.** FastAPI with SQLAlchemy 2.x (sync), Pydantic v2, Alembic migrations, psycopg 3.
- **Database.** PostgreSQL 16. Runs locally via Docker on host port 5433, or on any managed provider.
- **Authentication.** HS256 JWTs for access (10 min) and refresh (7 days), argon2 password hashing, roles checked server-side on every request.
- **Photo storage.** The local filesystem behind `StorageService`, mounted as a persistent Docker volume so uploads survive restarts.
- **Email.** `NotificationService` dispatches post-commit background tasks over SMTP. Resend's relay is the production provider.

## User Roles & Workflows

```mermaid
flowchart LR
    R["Resident"] -->|registers / logs in| AUTH
    AUTH --> FILE["Files complaint (category, description, photo)"]
    FILE --> OPEN["OPEN"]
    OPEN -->|admin reviews| IP["IN_PROGRESS"]
    IP -->|admin resolves with note| RES["RESOLVED"]
    RES --> CLOSED["Closed (immutable)"]
    OPEN -.->|admin resolves directly, note required| RES
    FILE --> H1["history: Complaint created"]
    OPEN --> H2["history: status + actor + timestamp + note"]
    IP --> H3["history: status + actor + timestamp + note"]
```

Each status transition appends a row to the complaint's history with the acting admin, the timestamp, and the optional note, so the full journey of a complaint can always be reconstructed.

## Complaint Lifecycle

- **Creation.** A resident files a complaint against an active category. It starts `OPEN` with priority `LOW`, and an initial history row ("Complaint created") is written in the same transaction.
- **Transitions.** Enforced server-side:

```mermaid
stateDiagram-v2
    [*] --> OPEN
    OPEN --> IN_PROGRESS: admin
    OPEN --> RESOLVED: admin (note required)
    IN_PROGRESS --> RESOLVED: admin
    RESOLVED --> [*]
```

  Resolved is terminal. There is no reopen path, and a resolved complaint can never be marked overdue. Invalid or repeat transitions are rejected with a `409 invalid_status_transition`.
- **Priority.** Admins set Low, Medium, or High at any time via `PATCH /complaints/{id}/priority`. Priority is persisted and drives admin ordering. It is triage metadata rather than a lifecycle event, so it deliberately writes no history row.
- **Progress notes.** Admins can append an immutable note to a complaint's timeline without changing status (`POST /complaints/{id}/notes`). Notes are rejected once a complaint is resolved.
- **Resolution.** Resolving a complaint stamps `resolved_at`. A direct Open to Resolved transition requires a non-blank note.
- **History.** The append-only `complaint_history` table records every status change with status, actor, timestamp, and optional note. Both residents and admins can view the full chronological timeline.
- **Overdue.** An unresolved complaint past the configured threshold is flagged overdue and rises to the top of the admin list (see the next section).

## Overdue Detection

Overdue is computed on the fly and never stored, so it cannot go stale.

```
overdue = status != RESOLVED AND now(UTC) > created_at + N days
```

- **Configurable threshold.** `N` comes from the `system_settings` table under the key `overdue_threshold_days`, falling back to the `OVERDUE_THRESHOLD_DAYS` environment variable (default 3, allowed range 1 to 365).
- **Runtime configuration.** Admins change the threshold from the Settings page or via `PATCH /api/v1/admin/settings/overdue-threshold`. The change takes effect immediately because the predicate is evaluated in SQL on every query.
- **Resolved exclusion.** Resolved complaints are excluded by the first clause of the predicate, so closing a complaint can never turn it overdue.
- **Surfacing.** The admin complaints page defaults to `sort=overdue`, which puts overdue items first, then orders by priority (High to Low) and newest first. The same predicate drives the dashboard's overdue count and the Overdue filter. When an admin explicitly picks another sort (triage, newest, oldest, priority), that choice is honored.
- **No cron needed.** Since it is computed at read time, there is no scheduled job to drift out of sync.

## Photo Upload & Storage

- **Upload.** `POST /api/v1/complaints` accepts `multipart/form-data` with `category_id`, `description`, and an optional `photo` field.
- **Validation.** The content type must be `image/jpeg`, `image/png`, or `image/webp`. The extension must match the content type, and the file's magic bytes are sniffed so arbitrary payloads are rejected. Empty files and anything over `MAX_UPLOAD_SIZE_MB` (default 5 MB) get a 422.
- **Storage.** Valid files are written to `uploads/complaints/<uuid-hex>.<ext>` through `StorageService`. The database keeps only the relative path, never the image bytes.
- **DB reference.** The `complaints.photo_path` column links a complaint to its file. Responses expose a `photo_url` API path.
- **Authenticated retrieval.** Photos are served only through `GET /api/v1/complaints/{id}/photo`. Owners and admins can fetch; anonymous requests get 401 and foreign requests get 404. There is no public static `/uploads` route.
- **Docker persistence.** The compose stack mounts a named volume (`uploads`) at `/app/uploads`, so photos survive container recreation.
- **Storage is local.** This project uses local persistent storage on purpose. The `StorageService` interface can be swapped for an object store without touching domain code if you outgrow the disk.

## Notifications

Two events trigger email:

1. A complaint status change goes to the owning resident, with the complaint id, category, old and new status, and the admin's note.
2. An important notice goes to every active resident, with the notice title and content.

```mermaid
flowchart LR
    ADMIN["Admin"] -->|PATCH status| TX["Transaction: status + history row commit"]
    TX -->|after commit| BT["Background task"]
    BT --> SMTP["NotificationService to SMTP (Resend)"]
    SMTP --> R1["Resident inbox"]
    ADMIN -->|POST important notice| TX2["Notice commits"]
    TX2 -->|after commit| BT2["Background fan-out"]
    BT2 --> SMTP
```

- **Send after commit.** Emails are enqueued on FastAPI `BackgroundTasks` and run only after the database transaction commits, so a rolled-back operation never produces an email.
- **Failure isolation.** Delivery errors are caught and logged. They never surface in API responses and never corrupt stored data.
- **Config.** `EMAIL_ENABLED` (default `false`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`. Port 465 uses implicit TLS; other ports use STARTTLS.
- **Resend.** In production, point the SMTP settings at `smtp.resend.com` with port 465, user `resend`, and the Resend API key as the password, plus a verified sender in `EMAIL_FROM`. No code change is required; the service already speaks SMTP.
- **Dev mode.** With `EMAIL_ENABLED=false`, each message is logged as a skip line, so local development never needs an SMTP server.

See [docs/notification-flow.md](docs/notification-flow.md) for the full flow, and [docs/system-design.md](docs/system-design.md) for the design rationale.

## Admin Dashboard

`GET /api/v1/dashboard/summary` aggregates live data from the database on every request:

- **Status totals.** Counts per status (Open, In Progress, Resolved) and the overall total, drawn as a donut.
- **Category totals.** Per-category complaint counts as a vertical bar chart. Categories come straight from the database: the aggregation returns every category that exists in the system, including ones with zero complaints. Nothing is hardcoded to a fixed subset.
- **Overdue total.** The count of currently overdue complaints, using the active threshold.
- **System feed.** A rolling feed of recent complaint events.

The numbers change as complaint data changes, because they are computed from the database at request time. There is no stale or mocked data to worry about.

## Admin Resident Management

- `GET /api/v1/admin/residents` returns a paginated list with search and filters, including each resident's active or inactive status.
- `PATCH /api/v1/admin/residents/{id}` activates or deactivates a resident account. Deactivated residents cannot log in.
- Both endpoints are admin-only. Residents get a 403 if they try.

## Authentication & Security

- **Access tokens.** HS256-signed JWTs that last `ACCESS_TOKEN_EXPIRE_MINUTES` (default 10 minutes) and carry the user id, role, issued-at, and expiry.
- **Refresh tokens.** They last `REFRESH_TOKEN_EXPIRE_DAYS` (default 7 days). When an access token expires, the frontend exchanges the refresh token at `POST /api/v1/auth/refresh` in a single-flight request and retries the original call. A page reload never logs the user out.
- **Logout.** Clears the stored tokens and redirects to the login page.
- **Role-based authorization.** The role is persisted in the database and re-derived from the user id on every request. Admin endpoints are guarded by a `require_admin` dependency. A resident asking for another resident's complaint gets a 404, so foreign resources cannot even be probed for existence. Fiddling with frontend state or token claims cannot grant admin access.
- **Passwords.** Hashed with argon2. Registration enforces length and character-policy rules, and weak passwords are rejected.
- **Account changes.** Changing email or password requires the current password. Email uniqueness is enforced.
- **File access.** Photos are served only to the owner or an admin, through the authenticated endpoint.
- **Upload validation.** Content type, extension, and magic-byte checks, a size cap, and randomized UUID filenames.
- **Rate limiting.** Login and registration are limited to 10 requests per minute per IP (an in-process sliding window that returns 429). A horizontally scaled deployment should enforce equivalent limits at the reverse proxy.
- **CORS.** Restricted to the origins in `CORS_ORIGINS`.
- **No secrets committed.** Everything sensitive is an environment variable. `.env` is gitignored, and `.env.example` holds placeholders only.

## API Documentation

The complete reference lives in [docs/api.md](docs/api.md), and the API is self-documenting at `http://<backend>/docs` (Swagger UI).

Everything is prefixed with `/api/v1` except the health probes. Errors use `{ "detail": "...", "code": "..." }`, and paginated lists use `{ total, limit, offset, items }`.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Public | Register a resident account |
| POST | `/api/v1/auth/login` | Public | Log in; returns access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Public | Exchange a refresh token for fresh tokens |
| GET | `/api/v1/auth/me` | Authenticated | Current user profile |
| PATCH | `/api/v1/users/me` | Authenticated | Update own name |
| PATCH | `/api/v1/users/me/email` | Authenticated | Change own email (current password required) |
| PATCH | `/api/v1/users/me/password` | Authenticated | Change own password (current password required) |
| GET | `/api/v1/categories` | Authenticated | List categories (residents see active only) |
| POST | `/api/v1/categories` | Admin | Create category |
| PATCH | `/api/v1/categories/{id}` | Admin | Update category |
| DELETE | `/api/v1/categories/{id}` | Admin | Soft-delete category |
| POST | `/api/v1/complaints` | Resident | Create complaint (multipart, optional photo) |
| GET | `/api/v1/complaints` | Authenticated | List complaints (filters + sort; residents see own) |
| GET | `/api/v1/complaints/{id}` | Authenticated* | Get complaint (*own only for residents; foreign gets 404) |
| GET | `/api/v1/complaints/{id}/history` | Authenticated* | Append-only status history |
| GET | `/api/v1/complaints/{id}/photo` | Owner or Admin | Authenticated photo stream |
| PATCH | `/api/v1/complaints/{id}/status` | Admin | Transition status (writes history, emails resident) |
| PATCH | `/api/v1/complaints/{id}/priority` | Admin | Set priority |
| POST | `/api/v1/complaints/{id}/notes` | Admin | Append an immutable progress note |
| GET | `/api/v1/notices` | Authenticated | List notices (important first, then newest) |
| POST | `/api/v1/notices` | Admin | Create notice (important triggers email fan-out) |
| GET | `/api/v1/notices/{id}` | Authenticated | Get a notice |
| PATCH | `/api/v1/notices/{id}` | Admin | Update a notice |
| DELETE | `/api/v1/notices/{id}` | Admin | Delete a notice |
| GET | `/api/v1/dashboard/summary` | Admin | Dashboard aggregates |
| GET | `/api/v1/admin/residents` | Admin | List/search residents |
| PATCH | `/api/v1/admin/residents/{id}` | Admin | Activate/deactivate a resident |
| GET | `/api/v1/admin/settings` | Admin | Current system settings |
| PATCH | `/api/v1/admin/settings/overdue-threshold` | Admin | Set overdue threshold (1 to 365 days) |
| GET | `/health` | Public | Liveness probe |
| GET | `/health/db` | Public | Database connectivity probe |

`GET /api/v1/complaints` accepts the filters `category_id`, `status`, `priority`, `date_from`, `date_to`, and `overdue`, plus pagination (`limit`, `offset`) and sorting (`sort=overdue|triage|newest|oldest|priority`). The admin default is `overdue`.

## Database Schema

Six tables, all keyed by UUID except `system_settings`:

```mermaid
erDiagram
    users {
        uuid id PK
        text name
        text email UK
        text password_hash
        role role
        bool is_active
    }
    categories {
        uuid id PK
        text name UK
        text description
        bool is_active
    }
    complaints {
        uuid id PK
        uuid resident_id FK
        uuid category_id FK
        text description
        text photo_path
        priority priority
        status status
        timestamptz resolved_at
    }
    complaint_history {
        uuid id PK
        uuid complaint_id FK
        status status
        uuid actor_id FK
        text note
    }
    notices {
        uuid id PK
        text title
        text content
        bool is_important
        uuid created_by FK
    }
    system_settings {
        text key PK
        text value
    }
    complaints }o--|| users : "resident_id"
    complaints }o--|| categories : "category_id"
    complaint_history }o--|| complaints : "complaint_id (CASCADE)"
    complaint_history }o--|| users : "actor_id"
    notices }o--|| users : "created_by"
```

- **`users`.** A resident/admin role enum, a unique email, an argon2 hash, and an active flag.
- **`categories`.** A unique name, soft-deleted via `is_active = false` so historical complaints keep their reference.
- **`complaints`.** Resident and category foreign keys (RESTRICT), description, optional photo path, priority and status enums, and `resolved_at`. Indexed on resident, category, status, priority, and created_at.
- **`complaint_history`.** The append-only audit trail. References the complaint (cascade delete) and the acting user (RESTRICT), with a status, an optional note, and a timestamp.
- **`notices`.** Title, content, `is_important` (indexed with created_at), and the creator.
- **`system_settings`.** A key/value store that holds `overdue_threshold_days`.

See [docs/database.md](docs/database.md) for the full schema documentation.

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/routes/       # auth, users, categories, complaints, notices,
│   │   │                     # dashboard, admin_residents, admin_settings, health
│   │   ├── core/             # config, security (JWT + argon2), dependencies,
│   │   │                     # enums, exceptions, rate_limit
│   │   ├── db/               # engine, session, declarative base
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic contracts
│   │   ├── services/         # business logic + storage/notification abstractions
│   │   ├── main.py           # app factory
│   │   └── seed.py           # dev seeding
│   ├── alembic/              # migrations
│   └── tests/                # pytest suite (159+ tests)
├── frontend/
│   ├── app/                  # Next.js App Router pages (login, dashboard, complaints,
│   │                         # my-complaints, notices, admin/*, profile, ...)
│   ├── components/           # shell, auth provider, shared UI, complaint widgets
│   └── lib/                  # API client, query keys, types
├── docs/                     # architecture, api, database, system-design,
│                             # notification-flow, index, knowledge-graph
├── .github/workflows/        # backend CI + GHCR publish
├── Dockerfile
├── docker-compose.yml
├── alembic.ini
├── pyproject.toml
├── requirements.txt
└── .env.example
```

## Local Development

### Prerequisites

- Python 3.12
- Node.js 20+ and pnpm
- Docker (for the local PostgreSQL database)

### 1. Backend setup

```powershell
# from the repository root
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env        # bash: cp .env.example .env
```

Start the database:

```powershell
docker compose up -d db
```

This runs `postgres:16-alpine`. The database is exposed on host port **5433** (5432 is often taken by an existing local PostgreSQL; inside the Docker network the host is `db:5432`). The `pgdata` volume persists the data.

Apply migrations and seed development data:

```powershell
$env:PYTHONPATH="backend"     # bash: export PYTHONPATH=backend
alembic upgrade head
python -m app.seed            # optional: add --with-sample-data
```

Run the backend:

```powershell
uvicorn app.main:app --reload --port 18000
```

Interactive docs: http://127.0.0.1:18000/docs. Health probes: `GET /health` and `GET /health/db`.

### 2. Frontend setup

```powershell
cd frontend
pnpm install
copy .env.example .env.local  # bash: cp .env.example .env.local
$env:NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:18000"   # bash: export NEXT_PUBLIC_API_BASE_URL=...
pnpm dev
```

The frontend runs at http://localhost:3000.

### 3. Full-stack via Docker Compose

```powershell
docker compose up --build
```

This runs the database and the backend container (which applies migrations on startup) with a persistent uploads volume. The API is exposed at http://localhost:8000. The frontend is not containerized; run it locally as above.

### Ports

| Service | Port |
| --- | --- |
| Backend (API + docs) | 8000 (Docker) / 18000 (local dev) |
| Frontend (Next.js) | 3000 |
| PostgreSQL | 5433 (host) / 5432 (Docker network) |

### Photo storage directory

Uploads land in `uploads/complaints/` relative to the backend working directory. In Docker this is a named volume (`uploads`) mounted at `/app/uploads`.

### Email configuration

Email is off by default (`EMAIL_ENABLED=false`). Set it to `true` and fill in the `SMTP_*` variables to enable delivery. See [Notifications](#notifications) for the details.

## Environment Variables

Everything below comes from [.env.example](.env.example). Copy it to `.env` and adjust. Never commit a real `.env`.

### Backend

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://smt:smt@127.0.0.1:5433/society_maintenance` | SQLAlchemy connection string |
| `JWT_SECRET_KEY` | dev placeholder | HS256 signing key; use a long random string in production |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `uploads` | Local photo storage directory |
| `MAX_UPLOAD_SIZE_MB` | `5` | Max photo size in MB |
| `EMAIL_ENABLED` | `false` | When false, emails are logged and skipped |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `EMAIL_FROM` | empty | SMTP transport (Resend relay in production) |
| `OVERDUE_THRESHOLD_DAYS` | `3` | Fallback overdue threshold when unset in the DB |
| `ENVIRONMENT` / `DEBUG` | `development` / `true` | Environment mode |

### Frontend

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:18000` | Base URL of the FastAPI backend (without `/api/v1`) |

## Docker Deployment

The backend image is built from the root `Dockerfile` (`python:3.12-slim`) and published to **GitHub Container Registry (GHCR)** by `.github/workflows/docker-publish.yml`, which triggers on every `v*` tag push.

- **Image:** `ghcr.io/<owner>/<repo>/residency-backend`
- **Tags:** the version tag (for example `v1.1.0`) plus `latest`
- **Port:** 8000 (configurable via `PORT`)
- **Photo persistence:** mount a volume at `/app/uploads` (the compose stack already does this with a named `uploads` volume).

```bash
docker pull ghcr.io/<owner>/<repo>/residency-backend:v1.1.0

docker run -d --name residency \
  -p 8000:8000 \
  -v residency-uploads:/app/uploads \
  -e DATABASE_URL="postgresql+psycopg://smt:smt@<db-host>:5432/society_maintenance" \
  -e JWT_SECRET_KEY="<long-random-string>" \
  -e CORS_ORIGINS="https://residency.example.com" \
  -e EMAIL_ENABLED=true \
  -e SMTP_HOST="smtp.resend.com" \
  -e SMTP_PORT=465 \
  -e SMTP_USERNAME="resend" \
  -e SMTP_PASSWORD="<RESEND_API_KEY>" \
  -e EMAIL_FROM="Society Portal <noreply@your-domain.com>" \
  -e OVERDUE_THRESHOLD_DAYS=7 \
  ghcr.io/<owner>/<repo>/residency-backend:v1.1.0
```

Run `alembic upgrade head` before the first start (the compose backend does this automatically). Nothing is baked into the image; all of the above is runtime configuration.

## Production Deployment

> **Status:** the hosted URLs are waiting on deployment credentials. The steps below are the intended, verified setup. Nothing here is fabricated, and this section will be updated with the real URLs once the app is live.

The production topology mirrors the local architecture:

1. **Database.** A managed PostgreSQL (Render, Railway, Neon, or a VPS). Point `DATABASE_URL` at it and run `alembic upgrade head`.
2. **Backend.** Deploy the GHCR image (`ghcr.io/<owner>/<repo>/residency-backend`) to Render, Railway, or Fly with all the variables from [Environment Variables](#environment-variables), including `JWT_SECRET_KEY`, `CORS_ORIGINS` (the frontend origin), and the `EMAIL_*` block. Attach a persistent disk for `UPLOAD_DIR` (or move to an object store behind `StorageService`). Verify `GET /health` and `GET /health/db` over HTTPS.
3. **Frontend.** Deploy `frontend/` to Vercel (`pnpm build`), set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend origin, and add that origin to the backend's `CORS_ORIGINS`.
4. **Email.** Enable `EMAIL_ENABLED=true` and configure the Resend SMTP relay as described in [Notifications](#notifications). Send a test status-change email and a test important-notice email.
5. **Uploads persistence.** Attach persistent storage to the backend so uploaded photos survive redeploys. On a self-managed host, bind-mount a host directory (for example `/srv/residency/uploads:/app/uploads`).

Self-hosted variant: run PostgreSQL and the backend with `docker compose` behind a Cloudflare Tunnel, expose only the tunnel, and schedule regular `pg_dump` backups plus file-level backups of the uploads volume.

## Testing

```powershell
# Backend (from the repo root; the local database must be running)
pytest

# Frontend typecheck + production build (from frontend/)
pnpm exec tsc --noEmit
pnpm build
```

- **Backend pytest.** 159+ tests covering auth, the authorization matrix, the complaint lifecycle and history, photo upload and security, filters, pagination, overdue boundaries, notices and email triggers, dashboard aggregation, admin residents, account changes, and edge cases. The suite runs against an isolated `smt_test` database and needs no email configuration (`EMAIL_ENABLED=false` in tests).
- **Frontend typecheck and build.** `tsc --noEmit` and `next build` both pass clean.
- **Live E2E.** A 47-check E2E suite exercises registration, login, refresh, complaint creation with a photo, history, admin filtering, priority, the status lifecycle, overdue ordering, notices, and the dashboard against a live server.
- **CI.** `.github/workflows/backend-ci.yml` runs the full pytest suite against a PostgreSQL service container on every push to `main`.

## Demo Accounts

Seeded by `python -m app.seed` (idempotent; `--with-sample-data` also adds sample complaints and notices).

> **DEVELOPMENT ONLY. DO NOT USE THESE CREDENTIALS IN PRODUCTION.**

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!ChangeMe` |
| Resident | `resident@example.com` | `Resident123!ChangeMe` |

## Submission

- **Source code:** [github.com/InvictusRex/Residency](https://github.com/InvictusRex/Residency) on branch `main`
- **System design write-up:** [docs/system-design.md](docs/system-design.md) (under 800 words)
- **API documentation:** [docs/api.md](docs/api.md)
- **Database schema:** [docs/database.md](docs/database.md)
- **Notification flow:** [docs/notification-flow.md](docs/notification-flow.md)
- **Container image:** `ghcr.io/<owner>/<repo>/residency-backend` (tags: `v1.1.0`, `latest`)
- **Hosted application URL:** pending deployment (see [Production Deployment](#production-deployment))