# API Reference

Base URL: `http://localhost:8000`. All endpoints are prefixed with `/api/v1`, except the health probes at the root.

Conventions:

- **Auth**: a bearer token from `POST /api/v1/auth/login`, sent as `Authorization: Bearer <token>`. Roles: public, any authenticated user, RESIDENT only, or ADMIN only.
- **Refresh**: access tokens are short-lived (default 10 minutes). When one expires, exchange a refresh token via `POST /auth/refresh` (see below).
- **Pagination envelope** (`complaints`, `notices`, `admin/residents`):

```json
{ "total": 42, "limit": 20, "offset": 0, "items": [ ... ] }
```

- **Error envelope**: `{ "detail": "...", "code": "..." }` for all domain errors. Validation failures return 422 with `code: "validation_error"` and an additional `errors` array. Common codes: `not_authenticated` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `invalid_status_transition` (409), `validation_error` (422), `file_upload_error` (422).
- All timestamps in responses are UTC ISO 8601.
- Residents requesting a complaint they do not own receive 404 (not 403) to avoid disclosing existence.

## Authentication

### POST /auth/register - Public

Creates a resident account.

| Field | Type | Rules |
| --- | --- | --- |
| name | string | 2..120 chars |
| email | email | unique; stored lowercased |
| password | string | 8..128 chars; must contain upper, lower, and digit |

Response 201 - `UserOut`: `{id, name, email, role, is_active, created_at, updated_at}`.

Errors: 409 `email_already_registered`.

### POST /auth/login - Public

JSON body (not form-encoded): `{email, password}`.

Response 200 - `TokenResponse`:

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 600,
  "user": { "id": "...", "name": "...", "email": "...", "role": "ADMIN", "is_active": true, "created_at": "...", "updated_at": "..." }
}
```

`expires_in` is `ACCESS_TOKEN_EXPIRE_MINUTES * 60` (600 with the default 10 minutes). Errors: 401 `invalid_credentials`.

### POST /auth/refresh - Public

Exchanges a still-valid refresh token for a fresh access and refresh pair. Used by the frontend to keep sessions alive across page reloads without forcing a new login.

| Field | Type | Rules |
| --- | --- | --- |
| refresh_token | string | a valid, unexpired refresh token |

Response 200 - `TokenResponse` (same shape as login). Errors: 401 `invalid_refresh_token`.

### GET /auth/me - Any authenticated

Response 200 - `UserOut`.

## Users

### PATCH /users/me - Any authenticated

| Field | Type | Rules |
| --- | --- | --- |
| name | string | 2..120 chars |

Response 200 - `UserOut`. Errors: 422 validation.

### PATCH /users/me/email - Any authenticated

| Field | Type | Rules |
| --- | --- | --- |
| email | email | new address; unique |
| current_password | string | the account's current password |

Response 200 - `UserOut`. Errors: 401 `invalid_current_password`, 409 `email_already_registered`.

### PATCH /users/me/password - Any authenticated

| Field | Type | Rules |
| --- | --- | --- |
| current_password | string | the account's current password |
| new_password | string | 8..128 chars; must contain upper, lower, and digit |

Response 200 - `UserOut`. Errors: 401 `invalid_current_password`, 422 weak password.

## Categories

### GET /categories - Any authenticated

Residents receive active categories only; admins receive all (including inactive). Response 200 - array of `CategoryOut`: `{id, name, description, is_active, created_at, updated_at}`, ordered by name.

### POST /categories - Admin

| Field | Type | Rules |
| --- | --- | --- |
| name | string | 2..120 chars, unique |
| description | string \| null | max 1000 chars |

Response 201 - `CategoryOut`. Errors: 403 `admin_required`, 409 `category_already_exists`.

### PATCH /categories/{id} - Admin

Partial update; explicit null `description` clears it. Fields: `name`, `description`, `is_active` (all optional).

Response 200 - `CategoryOut`. Errors: 404 `category_not_found`, 409 `category_already_exists`.

### DELETE /categories/{id} - Admin

Soft delete: sets `is_active = false`; rows are never physically removed so historical complaints retain their category.

Response 200 - `{ "message": "category_deactivated" }`. Errors: 404.

## Complaints

### POST /complaints - Resident

Multipart form data:

| Field | Type | Rules |
| --- | --- | --- |
| category_id | UUID | must reference an active category |
| description | string | 5..5000 chars |
| photo | file, optional | JPEG (.jpg/.jpeg) / PNG / WebP; extension must match content type AND file magic bytes; max `MAX_UPLOAD_SIZE_MB` (default 5 MB); empty files rejected |

New complaints always start OPEN with priority LOW. An initial history row ("Complaint created") is written in the same transaction.

Response 201 - `ComplaintOut`:

```json
{
  "id": "...",
  "description": "...",
  "photo_url": "/api/v1/complaints/<id>/photo",
  "priority": "LOW",
  "status": "OPEN",
  "created_at": "...",
  "updated_at": "...",
  "resolved_at": null,
  "resident": { "id": "...", "name": "...", "email": "..." },
  "category": { "id": "...", "name": "Plumbing" }
}
```

Errors: 404 `category_not_found`, 422 `category_inactive` / `unsupported_file_type` / `file_extension_mismatch` / `file_too_large` / `empty_file`.

### GET /complaints - Any authenticated

Query parameters:

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| limit | int 1..100 | 20 | |
| offset | int >= 0 | 0 | |
| category_id | UUID | none | |
| status | OPEN \| IN_PROGRESS \| RESOLVED | none | |
| priority | LOW \| MEDIUM \| HIGH | none | |
| date_from | date | none | inclusive (UTC day start) on `created_at` |
| date_to | date | none | inclusive (UTC day end) on `created_at` |
| overdue | bool | none | dynamic predicate, never stored |
| sort | overdue \| triage \| newest \| oldest \| priority | overdue for admins | see below |

Scoping and ordering:

- Residents: results restricted to their own complaints. Residents always get newest-first ordering regardless of `sort`.
- Admins: the default and `sort=overdue` order overdue first, then priority (HIGH > MEDIUM > LOW), then newest. `sort=triage` orders OPEN, then IN_PROGRESS, then RESOLVED, then priority, then newest. `newest`, `oldest`, and `priority` behave as named.

Response 200 - paginated envelope of `ComplaintOut`.

### GET /complaints/{id} - Any authenticated (scoped)

Response 200 - `ComplaintOut`. Errors: 404 `complaint_not_found` (also for foreign complaints when called by a resident).

### GET /complaints/{id}/history - Any authenticated (scoped)

Chronological audit trail. Response 200:

```json
{
  "complaint_id": "...",
  "items": [
    { "id": "...", "status": "OPEN", "note": "Complaint created", "actor": { "id": "...", "name": "...", "role": "RESIDENT" }, "created_at": "..." },
    { "id": "...", "status": "IN_PROGRESS", "note": "Plumber assigned.", "actor": { "id": "...", "name": "...", "role": "ADMIN" }, "created_at": "..." }
  ]
}
```

Errors: 404.

### GET /complaints/{id}/photo - Owner or Admin

Streams the stored photo file. There is no public static upload route. Errors: 401 anonymous, 403 foreign resident, 404 no photo or missing file.

### PATCH /complaints/{id}/status - Admin

Body (unknown fields rejected):

| Field | Type | Rules |
| --- | --- | --- |
| status | OPEN \| IN_PROGRESS \| RESOLVED | target state |
| note | string \| null | max 2000 chars |

Transition rules:

| From | Allowed targets |
| --- | --- |
| OPEN | IN_PROGRESS, RESOLVED |
| IN_PROGRESS | RESOLVED |
| RESOLVED | none (immutable by design; no reopen endpoint) |

A direct OPEN to RESOLVED transition requires a non-blank note (422 `note_required_for_direct_resolution`). The status update and its history row commit atomically; afterwards the owning resident is emailed via a background task.

Response 200 - `ComplaintOut` (with `resolved_at` set on resolution).

Errors: 403 `admin_required`, 404, 409 `invalid_status_transition` (code detail e.g. `cannot_transition_resolved_to_in_progress`), 422 `note_required_for_direct_resolution`.

### PATCH /complaints/{id}/priority - Admin

| Field | Type |
| --- | --- |
| priority | LOW \| MEDIUM \| HIGH |

Priority changes do not write history entries. Response 200 - `ComplaintOut`. Errors: 403, 404.

### POST /complaints/{id}/notes - Admin

| Field | Type | Rules |
| --- | --- | --- |
| note | string | 1..2000 chars after trimming |

Appends an immutable progress entry to the complaint's history without changing its status. Rejected once the complaint is RESOLVED. Response 201 - `HistoryEntryOut` (same shape as history items above). Errors: 403, 404, 422 `resolved_complaint_is_closed`.

## Notices

### GET /notices - Any authenticated

Paginated, ordered important-first then newest-first. Response 200 - paginated envelope of `NoticeOut`: `{id, title, content, is_important, created_by: {id, name}, created_at, updated_at}`.

### POST /notices - Admin

| Field | Type | Rules |
| --- | --- | --- |
| title | string | 3..200 chars |
| content | string | 3..20000 chars |
| is_important | bool | default false |

If created as important, emails fan out to all active residents in a background task (creation only; later toggles never resend). Response 201 - `NoticeOut`.

### GET /notices/{id} - Any authenticated

Response 200 - `NoticeOut`. Errors: 404 `notice_not_found`.

### PATCH /notices/{id} - Admin

Optional fields: `title`, `content`, `is_important`. Toggling importance does not trigger emails. Response 200 - `NoticeOut`. Errors: 404.

### DELETE /notices/{id} - Admin

Hard delete. Response 200 - `{ "message": "notice_deleted" }`. Errors: 404.

## Dashboard

### GET /dashboard/summary - Admin

Response 200:

```json
{
  "total_complaints": 12,
  "by_status": { "OPEN": 4, "IN_PROGRESS": 3, "RESOLVED": 5 },
  "by_category": [
    { "category_id": "...", "category_name": "Plumbing", "count": 6 }
  ],
  "overdue_count": 2
}
```

`by_category` is ordered by count descending and includes every category that exists in the system, including those with zero complaints. `overdue_count` uses the current threshold.

## Admin Residents

### GET /admin/residents - Admin

Query parameters: `limit` (1..100, default 20), `offset` (default 0), `search` (matches name or email, case-insensitive), `status` (`active` or `inactive`), `sort` (`newest` or `name`).

Response 200 - paginated envelope of `UserOut`. Errors: 403.

### PATCH /admin/residents/{id} - Admin

| Field | Type |
| --- | --- |
| is_active | bool |

Activates or deactivates a resident account; deactivated residents cannot log in. Response 200 - `UserOut`. Errors: 403, 404 `user_not_found`.

## Settings

### GET /admin/settings - Admin

Response 200 - `{ "overdue_threshold_days": 3 }` (env fallback when unset).

### PATCH /admin/settings/overdue-threshold - Admin

| Field | Type | Rules |
| --- | --- | --- |
| overdue_threshold_days | int | 1..365 |

Effective immediately across dashboard counts, overdue filters, and ordering. Response 200 - same shape as GET.

## Health (root level)

### GET /health - Public

Response 200 - `{ "status": "ok" }`.

### GET /health/db - Public

Runs `SELECT 1` against the database.

Response 200 - `{ "status": "ok", "database": "ok" }`. Errors: 503 with code `database_unavailable`.