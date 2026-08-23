# Architecture

This document describes the structural design of the Society Maintenance Tracker backend: layering, dependency injection, abstractions, transaction strategy, error model, and configuration management.

## Layering

The codebase follows a strict three-layer flow. HTTP concerns never leak into business logic, and business logic never constructs responses.

```
Request
   |
   v
Routes (app/api/routes/)        thin handlers: parse input, declare dependencies,
   |                            delegate, map ORM objects to Pydantic schemas
   v
Services (app/services/)        all business rules: lifecycle transitions, scoping,
   |                            ordering, overdue computation, notifications, settings
   v
Models (app/models/)            SQLAlchemy 2.x declarative models; the only
                                place SQL shape is defined
```

- **Routes** contain no branching business rules. For example, `app/api/routes/complaints.py` reads form fields and the uploaded file, calls `complaint_service`, and serializes with `ComplaintOut`. Route-level validation (query bounds, regex-constrained `sort`, field lengths) is expressed declaratively through FastAPI/Pydantic.
- **Services** are plain functions taking a `Session` plus domain arguments. They raise typed exceptions rather than returning status codes. Examples: transition enforcement in `complaint_service.ALLOWED_TRANSITIONS`, resident scoping in `get_complaint_scoped`, threshold resolution in `settings_service`.
- **Schemas** (`app/schemas/`) define every request and response contract in Pydantic v2. Response models use `from_attributes` so ORM objects validate directly.

## Dependency Injection

FastAPI's dependency system wires everything per-request:

| Dependency | File | Responsibility |
| --- | --- | --- |
| `get_db` | `app/db/session.py` | Yields a `SessionLocal` session per request, always closes it |
| `get_current_user` | `app/core/dependencies.py` | Extracts bearer token (`OAuth2PasswordBearer`), decodes the JWT, loads an active `User`; missing/invalid token raises 401 |
| `require_admin` / `require_resident` | `app/core/dependencies.py` | Role gates built on top of `get_current_user`; violations raise 403 |

Role checks are declared on each route via `Depends(...)`, so authorization is visible in the route signature itself. `BackgroundTasks` is injected where emails are enqueued after commit. Tests override `get_db` with `app.dependency_overrides` to point at the test database.

## Abstractions

Two cross-cutting infrastructure concerns sit behind narrow service interfaces so implementations can be replaced without touching routes or domain logic:

### StorageService (`app/services/storage_service.py`)

Interface: `save_file(data, original_filename, content_type) -> StoredFile`, `delete_file(storage_path)`, `resolve_file(storage_path)`, `media_type_for(storage_path)`.

The default implementation writes to the local filesystem under `{UPLOAD_DIR}/complaints/<uuid-hex>.<ext>`, validates content type against extension and file magic bytes, enforces `MAX_UPLOAD_SIZE_MB`, and rejects unsafe paths on resolve/delete. The database stores only the relative path; files are served exclusively through the authenticated endpoint `GET /api/v1/complaints/{id}/photo` (owner or admin), so no public static route exists. To move to S3 or another object store, implement the same methods — no other module needs to change.

### NotificationService (`app/services/notification_service.py`)

Interface: `send_complaint_status_changed_email(...)`, `send_important_notice_email(...)`. The single implementation uses SMTP (implicit TLS on port 465, STARTTLS otherwise). With `EMAIL_ENABLED=false` it logs a skip line instead of sending, which keeps development and test flows fully functional without an SMTP server. Delivery failures are caught, logged, and reported as a `False` return — they never propagate into request handling.

## Transaction Strategy

Sessions are created per request by `get_db`. Services own transaction boundaries explicitly:

- **Create complaint**: category check, file save, complaint insert, initial history row ("Complaint created"), then a single `db.commit()`. The photo is written before the DB commit; if validation fails earlier, nothing persists.
- **Status change**: the status update, `resolved_at` stamping, and the new `complaint_history` row are committed atomically in one transaction — a status change can never exist without its audit entry.
- **Emails are dispatched after commit.** Routes enqueue `notification_service` methods on FastAPI `BackgroundTasks`, which run only once the response transaction has succeeded. A provider outage therefore cannot roll back or corrupt data; it can only lose an email.
- The important-notice fan-out runs entirely in the background task and opens its own short-lived session (`SessionLocal`) rather than reusing the request session, since the request session is closed by then.
- Priority changes intentionally do not write history; they are treated as triage metadata, not lifecycle events.

## Error Model

All domain errors derive from `AppError` (`app/core/exceptions.py`), carrying `status_code`, machine-readable `code`, and human-readable `detail`. A global exception handler in `app/main.py` renders them as:

```json
{ "detail": "...", "code": "..." }
```

Built-in subclasses: `NotFoundError` (404), `PermissionDeniedError` (403), `UnauthorizedError` (401), `ConflictError` (409), `ValidationError` (422), `InvalidTransitionError` (409), `FileUploadError` (422). Two additional handlers normalize framework errors into the same envelope:

- `RequestValidationError` -> 422 with `code: "validation_error"` and an `errors` array of field locations/messages.
- Unhandled exceptions -> 500 with `code: "internal_error"`, logged with a stack trace but no internals leaked to the client.

A deliberate access-control nuance: when a resident requests another resident's complaint, the service raises `NotFoundError` (not 403) so the existence of foreign resources is not disclosed.

## Configuration Management

Configuration lives in `app/core/config.py` as a pydantic-settings `Settings` class:

- Reads a `.env` file (UTF-8) with environment variables taking precedence.
- Cached at import time via `@lru_cache` and exposed as the module-level `settings` singleton.
- Typed coercion throughout: ints for sizes/thresholds/durations, bools for flags, `Literal` for `ENVIRONMENT`, and a custom validator that splits `CORS_ORIGINS` on commas into a list.
- Alembic shares this same settings object (`alembic/env.py` sets `sqlalchemy.url` from `settings.DATABASE_URL`), so migrations always target the active environment's database.

Runtime-editable configuration is deliberately separated from env config: the overdue threshold is stored in the `system_settings` table and editable by admins, with the `OVERDUE_THRESHOLD_DAYS` env value used only as a fallback when the row is absent or unparseable.
