# System Design

This document describes the core design of Residency, a society maintenance tracker built as a FastAPI backend, Next.js frontend, and PostgreSQL database. It focuses on the four subsystems the platform depends on: complaint history, overdue detection, photo handling, and notifications.

## Complaint History Model

Every complaint carries an immutable audit trail. The `complaint_history` table stores one row per event with `complaint_id` (foreign key to `complaints`, cascade-deleted), `status` (the state the complaint moved to), `actor_id` (foreign key to `users`; the resident or admin responsible), `note` (optional free text), and `created_at` (server-set UTC timestamp).

History is append-only by construction: there is no update or delete path in the application, so previous entries always remain intact and chronological order is guaranteed by `created_at`. Creating a complaint inserts an initial OPEN row ("Complaint created") in the same transaction as the complaint itself, so a complaint can never exist without its history. Each admin status transition commits the status update and its history row atomically, so an audit entry can never be lost or detached from its event. Priority changes intentionally write no history because they are triage metadata, not lifecycle events. Residents and admins both view the timeline through `GET /complaints/{id}/history`.

## Overdue Detection

A complaint is overdue when it is unresolved and has sat untouched past a configurable threshold: `status != RESOLVED AND now(UTC) > created_at + N days`. Overdue state is computed dynamically per query and never stored, so it can never go stale.

The threshold `N` is read from the `system_settings` table under the key `overdue_threshold_days`, falling back to the `OVERDUE_THRESHOLD_DAYS` environment variable (default 3, allowed range 1..365). Admins edit it at runtime via `PATCH /admin/settings/overdue-threshold`, and the change takes effect on the very next query because the predicate is evaluated in SQL against the current timestamp.

Resolved complaints are excluded by the first clause of the predicate, so a closed complaint can never become overdue regardless of age. In the admin complaint list, the default and explicit `sort=overdue` ordering surfaces overdue items first (then priority HIGH to LOW, then newest); an explicit alternate sort (triage, newest, oldest, priority) is always honored. The same predicate powers the dashboard's overdue count and the overdue true/false filter.

## Photo Handling

Residents upload an optional photo with a complaint as `multipart/form-data`. The backend validates the content type (JPEG, PNG, WebP), checks that the file extension matches, sniffs the file's magic bytes so arbitrary payloads are rejected, and enforces `MAX_UPLOAD_SIZE_MB` (default 5 MB). Valid files are written to the local filesystem as `uploads/complaints/<uuid-hex>.<ext>` through a `StorageService` abstraction; the database stores only the relative path, never the image bytes.

Because uploads live on disk, Docker deployments mount a persistent volume so photos survive container recreation. Retrieval is authenticated: photos are served only through `GET /complaints/{id}/photo`, which allows the owning resident or an admin and returns 404 for foreign requests; there is no public static upload route, and internal paths are never exposed. The storage layer can be swapped for object storage behind the same interface without touching domain code.

## Notification Flow

Two events produce emails: a complaint status change (to the owning resident) and the creation of an important notice (to all active residents). Both are dispatched after the request's database transaction commits, via FastAPI background tasks, so a rolled-back or failed operation never produces an email.

Delivery uses SMTP through a `NotificationService`; in production this points at Resend's SMTP relay (`smtp.resend.com`, port 465, user `resend`, password equals the Resend API key), configured purely through environment variables. With `EMAIL_ENABLED=false` (the default) each message is logged and skipped, keeping development flows free of an SMTP dependency. Sending is best-effort: failures are logged and swallowed and never affect API responses or stored data, so a provider outage can lose an email but never corrupt a transaction. Status-change emails include the complaint id, category, old and new status, and the admin's optional note; important-notice emails fan out individually to each active resident and are sent only at creation (later importance toggles never resend).