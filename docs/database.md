# Database

The schema is managed by Alembic (initial revision: `backend/alembic/versions/2026_08_23_initial_schema.py`) and consists of six tables. All primary keys are UUIDs generated client-side (`uuid4`), except `system_settings`, which is keyed by a string.

## Conventions

- **Timestamps**: every table has `created_at`/`updated_at` as `DateTime(timezone=True)` with a server default of `now()`; `updated_at` also uses `onupdate=now()`. All times are UTC.
- **Enums** are native PostgreSQL enum types shared across tables:
  - `user_role`: `RESIDENT`, `ADMIN`
  - `complaint_status`: `OPEN`, `IN_PROGRESS`, `RESOLVED` (used by both `complaints` and `complaint_history`)
  - `complaint_priority`: `LOW`, `MEDIUM`, `HIGH`
- **Soft deletes**: only categories support them (`is_active = false`). Notices delete hard; users and complaint history are never deleted by the application.
- **Foreign keys with `RESTRICT`** protect referenced users/categories so historical complaints always retain their links; category removal is therefore soft by design.

## Entity Relationships

```
users 1 ----< complaints >---- 1 categories
users 1 ----< complaints          (resident_id)
complaints 1 ----< complaint_history >---- 1 users (actor)
users 1 ----< notices              (created_by)

system_settings: standalone key/value table
```

## Tables

### users

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, default uuid4 |
| name | varchar(120) | not null |
| email | varchar(255) | unique, not null |
| password_hash | varchar(255) | not null (argon2 hash) |
| role | enum `user_role` | not null, default RESIDENT |
| is_active | boolean | not null, default true |
| created_at / updated_at | timestamptz | server default now(); updated_at auto-updates |

Relationships: `complaints` (one-to-many), author of `notices`.

### categories

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK |
| name | varchar(120) | unique, not null |
| description | text | nullable |
| is_active | boolean | not null, default true |
| created_at / updated_at | timestamptz | as convention |

Deactivation (soft delete) hides the category from residents while keeping existing complaints valid. Inactive categories cannot be used for new complaints (422 `category_inactive`).

### complaints

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK |
| resident_id | UUID | FK -> users.id, ondelete RESTRICT, indexed |
| category_id | UUID | FK -> categories.id, ondelete RESTRICT, indexed |
| description | text | not null |
| photo_path | varchar(512) | nullable; relative path under the uploads dir |
| priority | enum `complaint_priority` | not null, default LOW, indexed |
| status | enum `complaint_status` | not null, default OPEN, indexed |
| created_at | timestamptz | server default now(), indexed |
| updated_at | timestamptz | server default now(), onupdate now() |
| resolved_at | timestamptz | nullable; set when status becomes RESOLVED |

Indexes: `ix_complaints_resident_id`, `ix_complaints_category_id`, `ix_complaints_status`, `ix_complaints_priority`, `ix_complaints_created_at`. These cover the common list queries (resident scoping, status/priority filters, date-range and overdue computations).

There is no stored "overdue" column or flag; overdue is derived at query time (see below).

### complaint_history

Append-only audit trail for complaint lifecycle events.

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK |
| complaint_id | UUID | FK -> complaints.id, ondelete CASCADE, indexed |
| status | enum `complaint_status` | not null |
| actor_id | UUID | FK -> users.id, ondelete RESTRICT |
| note | text | nullable |
| created_at | timestamptz | server default now(), indexed |

Indexes: `ix_complaint_history_complaint_id`, `ix_complaint_history_created_at`.

Semantics:

- Complaint creation writes an initial row with status OPEN and note "Complaint created", actor = the resident.
- Each admin status transition writes one row in the same transaction as the status update, recording the new status, acting admin, and optional note.
- Rows are never updated or deleted (the DB-level CASCADE exists only to keep referential integrity if a complaint is ever physically removed).
- Priority changes deliberately produce no history rows.
- The API returns entries ordered by `created_at` ascending; timestamps are UTC ISO 8601 in JSON.

### notices

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK |
| title | varchar(200) | not null |
| content | text | not null |
| is_important | boolean | not null, default false |
| created_by | UUID | FK -> users.id, ondelete RESTRICT |
| created_at | timestamptz | server default now(), indexed |
| updated_at | timestamptz | server default now(), onupdate now() |

Index: composite `ix_notices_is_important_created_at (is_important, created_at)` matching the listing order (important first, then newest).

### system_settings

Simple key/value store for runtime-editable configuration.

| Column | Type | Constraints |
| --- | --- | --- |
| key | varchar(100) | PK (currently only `overdue_threshold_days`) |
| value | varchar(255) | not null (string-encoded integer) |
| updated_at | timestamptz | server default now(), onupdate now() |

The overdue threshold row is written only when an admin changes it; until then the env fallback applies (see Overdue Logic in the README). Because it is read per query, changes take effect immediately.

## Derived Data: Overdue

Overdue is computed dynamically in SQL rather than stored, using the predicate implemented in `app/services/overdue_service.py`:

```
status <> 'RESOLVED' AND created_at < now() - make_interval(days => N)
```

where `N` resolves from `system_settings.overdue_threshold_days`, falling back to the `OVERDUE_THRESHOLD_DAYS` environment variable. This guarantees consistency between dashboard counts, list filtering (`?overdue=true`), and ordering without any background jobs or stale flags.

## Migration Workflow

```
alembic upgrade head                                  # apply all revisions
alembic revision --autogenerate -m "message"          # diff models against DB
alembic downgrade -1                                  # roll back last revision
```

`backend/alembic/env.py` imports `app.core.config.settings` and points `sqlalchemy.url` at the active `DATABASE_URL`, so migrations run against whichever database the environment selects. Tests use this machinery too: `backend/tests/conftest.py` recreates a dedicated `smt_test` database and runs `upgrade head` before each pytest session.
