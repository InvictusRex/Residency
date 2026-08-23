# Society Maintenance Tracker

A FastAPI backend for residential society maintenance management. Residents file maintenance complaints (with optional photos), admins triage them through a status lifecycle, publish notices, and monitor a dashboard with overdue detection driven by an editable threshold.

## Features

- JWT authentication (HS256) with resident and admin roles
- Complaint lifecycle: OPEN -> IN_PROGRESS -> RESOLVED, with an append-only audit history
- Photo attachments (JPEG/PNG/WebP) stored on the local filesystem behind a storage abstraction
- Category management with soft deletes
- Society notice board; important notices trigger email fan-out to all active residents
- Admin dashboard summary: totals, per-status counts, per-category counts, overdue count
- Dynamic overdue detection based on an admin-editable threshold (no stored overdue flag)
- Email notifications via pluggable notification service (SMTP implementation, dev skip mode)
- OpenAPI documentation via Swagger UI and ReDoc
- Alembic-managed schema, Docker-based local PostgreSQL, full pytest suite against an isolated test database

## Architecture

The application follows a layered design:

- **Routes** (`app/api/routes/`) — thin HTTP handlers: request parsing, dependency injection, response serialization.
- **Services** (`app/services/`) — business logic: lifecycle rules, scoping, ordering, notifications, settings.
- **Models** (`app/models/`) — SQLAlchemy 2.x declarative ORM models.
- **Schemas** (`app/schemas/`) — Pydantic v2 request/response contracts.
- **Core** (`app/core/`) — configuration (pydantic-settings), security (JWT + argon2), shared dependencies, exceptions, enums.

Cross-cutting concerns are abstracted behind service interfaces:

- `StorageService` — file persistence (local filesystem today, object storage swappable).
- `NotificationService` — email delivery (SMTP today, disabled in development).

See [docs/architecture.md](docs/architecture.md) for details.

## Tech Stack

| Component | Technology |
| --- | --- |
| Language | Python 3.12 |
| Web framework | FastAPI, served by uvicorn |
| ORM | SQLAlchemy 2.x (sync) |
| Migrations | Alembic |
| Database | PostgreSQL (psycopg 3 driver) |
| Validation / settings | Pydantic v2 + pydantic-settings |
| Auth | PyJWT (HS256 access tokens), argon2-cffi password hashing |
| Testing | pytest + httpx TestClient |

## Project Structure

The repository is a monorepo with the backend under `backend/` and the Next.js frontend under
`frontend/` (added separately). Project-level configuration and deployment files live at the root.

```
.
├── backend/                    # Backend source (Python package rooted here)
│   ├── app/                    # The application source package
│   │   ├── main.py             # App factory, CORS, exception handlers
│   │   ├── seed.py             # Dev seeding script
│   │   ├── api/
│   │   │   ├── router.py       # Aggregates route modules under /api/v1
│   │   │   └── routes/         # auth, users, categories, complaints, notices,
│   │   │                       # dashboard, admin_settings, health
│   │   ├── core/
│   │   │   ├── config.py       # pydantic-settings, reads .env
│   │   │   ├── dependencies.py # get_current_user, require_admin, require_resident
│   │   │   ├── enums.py        # Role, ComplaintStatus, ComplaintPriority
│   │   │   ├── exceptions.py   # AppError hierarchy
│   │   │   └── security.py     # argon2 hashing, JWT encode/decode
│   │   ├── db/
│   │   │   ├── base.py         # Declarative Base
│   │   │   └── session.py      # Engine + SessionLocal + get_db dependency
│   │   ├── models/             # User, Category, Complaint, ComplaintHistory,
│   │   │                       # Notice, SystemSetting
│   │   ├── schemas/            # Pydantic request/response models
│   │   └── services/           # Business logic + storage/notification services
│   ├── alembic/
│   │   ├── env.py              # Reads DATABASE_URL from app settings
│   │   └── versions/           # Migration scripts
│   └── tests/
│       └── conftest.py         # Creates/migrates/drops smt_test database
├── frontend/                   # Next.js frontend (added separately)
├── alembic.ini
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── pyproject.toml
├── .env.example
├── .github/
│   └── workflows/backend-ci.yml
└── docs/
```

All backend commands below are run from the repository root. The `backend/` directory is placed on
the Python path automatically for pytest (`pythonpath` in `pyproject.toml`), Alembic (`alembic/env.py`),
and the Docker image (`PYTHONPATH`); for a local uvicorn or seed run, set `PYTHONPATH=backend`
(or run the command with the backend venv activated from inside `backend/`).

## Environment Setup

Requirements:

- Python 3.12
- Docker (for the local PostgreSQL instance)

Copy `.env.example` to `.env` and adjust as needed:

```
cp .env.example .env
```

Key variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://smt:smt@127.0.0.1:5433/society_maintenance` | SQLAlchemy connection string |
| `JWT_SECRET_KEY` | dev value | HS256 signing key — change for any real deployment |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `120` | Access token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `uploads` | Local photo storage directory |
| `MAX_UPLOAD_SIZE_MB` | `5` | Max photo size in megabytes |
| `EMAIL_ENABLED` | `false` | When false, emails are logged and skipped |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `EMAIL_FROM` | empty | SMTP transport configuration |
| `OVERDUE_THRESHOLD_DAYS` | `3` | Fallback overdue threshold when unset in DB |

Note on ports: the local database maps to host port **5433** (not 5432), because 5432 is commonly occupied by an existing PostgreSQL installation. Inside the Docker network the database is reached at `db:5432`.

## PostgreSQL Setup (Local Development)

Start only the database service:

```
docker compose up -d db
```

This runs `postgres:16-alpine` with user/password `smt:smt`, database `society_maintenance`, host port 5433, and a named volume (`pgdata`) for persistence. A health check (`pg_isready`) gates dependent services.

## Docker Setup (Full Stack)

To run both database and API:

```
docker compose up --build
```

The backend container automatically runs `alembic upgrade head` before starting uvicorn, so the schema is always migrated on startup. The API is exposed at http://localhost:8000.

## Installation (Local Python)

All commands run from the repository root. Python resolves `app` via `PYTHONPATH=backend`:

```
py -3.12 -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
$env:PYTHONPATH="backend"       # PowerShell (bash: export PYTHONPATH=backend)
python -m app.seed              # add --with-sample-data for demo complaints/notices
uvicorn app.main:app --reload --port 8000
```

`alembic`, `pytest`, and Docker set up the import path themselves; only a direct `python -m app.*` or
`uvicorn` run needs the `PYTHONPATH=backend` export above.

## Migrations

Apply all migrations:

```
alembic upgrade head
```

Alembic reads its connection string from `DATABASE_URL` via `app.core.config.settings` (see `backend/alembic/env.py`), so migrations target whatever environment is active.

To generate a new migration after changing models:

```
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

Review autogenerated revisions before applying them — autogenerate does not detect every change type.

## Seed Data

`python -m app.seed` is idempotent and creates:

- Admin: `admin@example.com` / `Admin123!ChangeMe`
- Resident: `resident@example.com` / `Resident123!ChangeMe`
- Categories: Plumbing, Electrical, Security, Cleaning, Other

With `--with-sample-data`, it also creates three sample complaints (one per status, with matching history entries) and two notices. These credentials are for **development only** — never seed them into production.

## Running the Server

```
$env:PYTHONPATH="backend"       # PowerShell (bash: export PYTHONPATH=backend)
uvicorn app.main:app --reload --port 8000
```

Interactive documentation:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json

Health probes (at the root, not under `/api/v1`):

- `GET /health` — service liveness
- `GET /health/db` — verifies database connectivity (503 if unreachable)

## API Overview

All endpoints live under `/api/v1` except the health probes.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Public | Register a resident account |
| POST | `/api/v1/auth/login` | Public | Log in, receive bearer token |
| GET | `/api/v1/auth/me` | Any authenticated | Current user profile |
| PATCH | `/api/v1/users/me` | Any authenticated | Update own profile (name) |
| GET | `/api/v1/categories` | Any authenticated | List categories (residents see active only) |
| POST | `/api/v1/categories` | Admin | Create category |
| PATCH | `/api/v1/categories/{id}` | Admin | Update category |
| DELETE | `/api/v1/categories/{id}` | Admin | Soft delete (deactivate) category |
| POST | `/api/v1/complaints` | Resident | Create complaint (multipart form, optional photo) |
| GET | `/api/v1/complaints` | Any authenticated | List complaints (residents see own only) |
| GET | `/api/v1/complaints/{id}` | Any authenticated* | Get complaint (*residents: own only; foreign ids return 404) |
| GET | `/api/v1/complaints/{id}/history` | Any authenticated* | Status audit trail (*same scoping) |
| PATCH | `/api/v1/complaints/{id}/status` | Admin | Transition status (writes history, notifies resident) |
| PATCH | `/api/v1/complaints/{id}/priority` | Admin | Set priority (no history entry by design) |
| GET | `/api/v1/notices` | Any authenticated | List notices (important first, then newest) |
| POST | `/api/v1/notices` | Admin | Create notice (important notices trigger emails) |
| GET | `/api/v1/notices/{id}` | Any authenticated | Get notice |
| PATCH | `/api/v1/notices/{id}` | Admin | Update notice |
| DELETE | `/api/v1/notices/{id}` | Admin | Delete notice (hard delete) |
| GET | `/api/v1/dashboard/summary` | Admin | Aggregated statistics |
| GET | `/api/v1/admin/settings` | Admin | Current system settings |
| PATCH | `/api/v1/admin/settings/overdue-threshold` | Admin | Set overdue threshold (1..365 days) |
| GET | `/health` | Public | Service liveness |
| GET | `/health/db` | Public | Database connectivity |

Paginated endpoints return `{total, limit, offset, items}`. Errors return `{detail, code}`. See [docs/api.md](docs/api.md) for the full reference.

## Authentication

1. Log in:

```
curl -X POST http://localhost:8000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"Admin123!ChangeMe\"}"
```

2. Copy `access_token` from the response. In Swagger UI click **Authorize** and paste the token (the OAuth2PasswordBearer flow sends it as `Authorization: Bearer <token>`). For curl, pass the header explicitly:

```
curl http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer <access_token>"
```

Tokens are HS256-signed JWTs containing `sub` (user id), `role`, `iat`, and `exp`.

## Testing

```
pytest
```

The suite is self-contained: it connects to the local PostgreSQL from `TEST_DATABASE_URL`
(default: `postgresql+psycopg://smt:smt@127.0.0.1:5433/smt_test`), drops/recreates that test
database, applies all Alembic migrations, and points uploads at a temporary directory.
No seed data, running server, or email configuration is required.

### CI

GitHub Actions (`.github/workflows/backend-ci.yml`) runs on every push to and pull request
against `main`: Python 3.12 on ubuntu-latest with a PostgreSQL 16 service container. The job
verifies imports, runs `alembic upgrade head` against a clean database, then executes the full
pytest suite against a second clean database. Email delivery is disabled in CI; no production
secrets are used.


## Photo Upload Behavior

- `POST /api/v1/complaints` accepts `multipart/form-data` with fields `category_id`, `description`, and optional `photo`.
- Accepted content types: `image/jpeg` (.jpg/.jpeg), `image/png`, `image/webp`; the file extension must match the content type.
- Maximum size: `MAX_UPLOAD_SIZE_MB` (default 5 MB); empty files are rejected.
- Files are stored as `uploads/complaints/<uuid-hex>.<ext>`; the database stores only the relative path.
- Photos are **not publicly accessible**. They are served exclusively through the authenticated endpoint
  `GET /api/v1/complaints/{complaint_id}/photo`: residents can fetch only their own complaint photos,
  admins can fetch any. Anonymous access returns 401, other residents' photos return 404, and missing
  files return 404. Responses expose the URL as `photo_url` (e.g. `/api/v1/complaints/<id>/photo`);
  the internal filesystem path is never exposed.
- Deleting or replacing photo storage is handled exclusively through `StorageService`.
- Login and registration endpoints are rate limited to 10 requests per minute per client IP;
  exceeding the limit returns 429 with code `rate_limited`. The limiter is in-process, so a
  horizontally scaled deployment should enforce equivalent limits at the reverse proxy level.
- Email delivery uses the SMTP abstraction; for production, Resend's SMTP relay works out of the box:
  set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USERNAME=resend`,
  `SMTP_PASSWORD=<RESEND_API_KEY>`, and a verified `EMAIL_FROM` (see `.env.example`).

## Email Configuration

Set `EMAIL_ENABLED=true` plus the `SMTP_*` variables to send real mail. Port 465 uses implicit TLS (`SMTP_SSL`); any other port uses STARTTLS. When `EMAIL_ENABLED=false` (the default), delivery is skipped and each message is logged instead, so development flows never require an SMTP server. Delivery failures are logged and swallowed — they never affect API responses or data integrity. See [docs/notification-flow.md](docs/notification-flow.md).

## Overdue Logic

Overdue status is computed dynamically and never stored:

- A complaint is overdue when `status != RESOLVED` AND `now(UTC) > created_at + N days`.
- `N` comes from the `system_settings` table key `overdue_threshold_days`, falling back to the `OVERDUE_THRESHOLD_DAYS` env var (default 3). Allowed range: 1..365.
- Admins can change it via `PATCH /api/v1/admin/settings/overdue-threshold`; the change takes effect immediately on all queries.
- In admin complaint listings the default ordering is overdue first, then priority (HIGH > MEDIUM > LOW), then newest. Residents always get plain newest-first ordering of their own complaints.

## Database Schema Overview

Six tables, all keyed by UUID (except `system_settings`, keyed by string):

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, name, email (unique), password_hash, role (`user_role`: RESIDENT/ADMIN), is_active | Timestamps `created_at`/`updated_at` |
| `categories` | id, name (unique), description, is_active | Soft delete via `is_active=False` |
| `complaints` | id, resident_id FK->users, category_id FK->categories, description, photo_path, priority (`complaint_priority`), status (`complaint_status`), created_at, resolved_at | FKs RESTRICT; indexes on resident_id, category_id, status, priority, created_at |
| `complaint_history` | id, complaint_id FK->complaints CASCADE, status (`complaint_status`), actor_id FK->users RESTRICT, note | Append-only audit trail; indexes on complaint_id, created_at |
| `notices` | id, title, content, is_important, created_by FK->users RESTRICT | Composite index `(is_important, created_at)` |
| `system_settings` | key (PK, e.g. `overdue_threshold_days`), value | Simple key/value store |

Cascade rules: deleting a complaint cascades to its history rows; users/categories referenced by complaints are protected (`RESTRICT`), which is why categories use soft deletion. All timestamps are `timestamptz` with server defaults of `now()`. See [docs/database.md](docs/database.md).

## Deployment Notes

- The `Dockerfile` CMD respects the `PORT` env var: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- `DATABASE_URL` is fully injectable; point it at a managed PostgreSQL instance.
- Apply migrations with `alembic upgrade head` (or rely on the backend container's startup command, as docker-compose does).
- `CORS_ORIGINS` accepts a comma-separated list of origins.
- The default local-disk upload storage is **ephemeral** on platforms such as Render or Railway: uploaded photos will be lost on redeploy or restart. Production deployments must implement an object-storage provider (e.g. S3) behind `StorageService.save_file/delete_file/resolve_file`; the rest of the codebase depends only on this interface, so no other changes are required. On a self-managed Docker host, mount a persistent volume (or bind mount such as `/srv/residency/uploads:/app/uploads`) so photos survive container recreation.
- Set a strong `JWT_SECRET_KEY` and disable seeding before exposing the service publicly.
- Self-hosted deployment (Debian + Docker + Cloudflare Tunnel): run PostgreSQL and the backend via
  `docker compose`, bind-mount a host directory for uploads (e.g. `/srv/residency/uploads:/app/uploads`),
  and expose only the tunnel — never publish the backend or PostgreSQL ports publicly. Point the
  tunnel hostname `api.residency.<domain>` at the backend container's port 8000 and
  `residency.<domain>` at the frontend, then set `CORS_ORIGINS=https://residency.<domain>`.
- Schedule regular `pg_dump` backups of the database and file-level backups of the uploads volume.

## Example End-to-End Workflow

Using curl from a fresh database (after migrations and seeding):

1. Register a new resident:

```
curl -X POST http://localhost:8000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Asha Resident\",\"email\":\"asha@example.com\",\"password\":\"Adm1nSecure9\"}"
```

2. Log in as the resident:

```
curl -X POST http://localhost:8000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"asha@example.com\",\"password\":\"Adm1nSecure9\"}"
```

Save the returned `access_token` as `RESIDENT_TOKEN`.

3. Browse categories:

```
curl http://localhost:8000/api/v1/categories -H "Authorization: Bearer %RESIDENT_TOKEN%"
```

4. File a complaint with a photo (replace `<category_id>`):

```
curl -X POST http://localhost:8000/api/v1/complaints ^
  -H "Authorization: Bearer %RESIDENT_TOKEN%" ^
  -F "category_id=<category_id>" ^
  -F "description=Kitchen tap is leaking continuously since morning." ^
  -F "photo=@leak.png"
```

5. Check your own complaints:

```
curl "http://localhost:8000/api/v1/complaints?limit=10&offset=0" ^
  -H "Authorization: Bearer %RESIDENT_TOKEN%"
```

6. Log in as the admin (seeded credentials):

```
curl -X POST http://localhost:8000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"Admin123!ChangeMe\"}"
```

Save the token as `ADMIN_TOKEN`.

7. Move the complaint to IN_PROGRESS (replace `<complaint_id>`):

```
curl -X PATCH http://localhost:8000/api/v1/complaints/<complaint_id>/status ^
  -H "Authorization: Bearer %ADMIN_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"status\":\"IN_PROGRESS\",\"note\":\"Plumber assigned.\"}"
```

8. Raise the priority:

```
curl -X PATCH http://localhost:8000/api/v1/complaints/<complaint_id>/priority ^
  -H "Authorization: Bearer %ADMIN_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"priority\":\"HIGH\"}"
```

9. Resolve it:

```
curl -X PATCH http://localhost:8000/api/v1/complaints/<complaint_id>/status ^
  -H "Authorization: Bearer %ADMIN_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"status\":\"RESOLVED\",\"note\":\"Tap replaced.\"}"
```

10. Inspect the audit trail and the dashboard:

```
curl http://localhost:8000/api/v1/complaints/<complaint_id>/history ^
  -H "Authorization: Bearer %ADMIN_TOKEN%"

curl http://localhost:8000/api/v1/dashboard/summary ^
  -H "Authorization: Bearer %ADMIN_TOKEN%"
```
