# Notification Flow

Email delivery is handled by `NotificationService` (`app/services/notification_service.py`) and dispatched through FastAPI `BackgroundTasks`. Two events trigger emails:

1. Complaint status change (to the owning resident)
2. Important notice creation (to all active residents)

## Design Invariants

- **Send-after-commit.** Emails are enqueued on `BackgroundTasks` and run only after the request's database transaction has committed successfully. A failed or rolled-back transaction never produces an email.
- **Failure isolation.** Delivery errors are caught, logged (`email delivery failed: ...`), and returned as `False`. They never surface in API responses, never retry automatically, and never affect stored data. An email can therefore be lost, but data cannot be corrupted by an email failure.
- **Dev mode.** With `EMAIL_ENABLED=false` (the default), no network call is made; each message is logged as a skip line instead:

  ```
  INFO email skipped (disabled): to=<recipient> subject=<subject>
  ```

- **Transport.** Port 465 uses implicit TLS (`SMTP_SSL` with a default SSL context); any other port uses plain SMTP upgraded via STARTTLS. Credentials are sent only when `SMTP_USERNAME` is configured. SMTP operations time out after 10 seconds.
- **No deduplication/resend.** Each trigger sends exactly once at fire time. There is no queue, retry, or replay mechanism.

## Flow 1: Complaint Status Change

Actors: Admin (initiator), API route, complaint service, NotificationService, owning Resident.

```
Admin                    API                          Service/DB                Background            SMTP
  |                       |                               |                         |                  |
  | PATCH /api/v1/complaints/{id}/status                   |                         |                  |
  |  {status, note}       |                               |                         |                  |
  |---------------------->| require_admin (JWT)           |                         |                  |
  |                       |------------------------------>|                         |                  |
  |                       | validate transition:          |                         |                  |
  |                       |   OPEN -> IN_PROGRESS|RESOLVED                         |                  |
  |                       |   IN_PROGRESS -> RESOLVED     |                         |                  |
  |                       |   RESOLVED -> (none)          |                         |                  |
  |                       | OPEN->RESOLVED requires note  |                         |                  |
  |                       |                               |                         |                  |
  |                       | BEGIN TX                      |                         |                  |
  |                       |   update status               |                         |                  |
  |                       |   set resolved_at if RESOLVED |                         |                  |
  |                       |   insert complaint_history row|                         |                  |
  |                       | COMMIT                        |                         |                  |
  |                       |<------------------------------|                         |                  |
  |                       | enqueue background task       |                         |                  |
  |                       |-------------------------------------------------------->|                  |
  |<-- 200 ComplaintOut --|                               |                         |                  |
  |                       |                               |   build message:        |                  |
  |                       |                               |   subject "Complaint    |                  |
  |                       |                               |   #xxxxxxxx status      |                  |
  |                       |                               |   updated: <STATUS>"    |                  |
  |                       |                               |   body: old/new status, |                  |
  |                       |                               |   optional note         |                  |
  |                       |                               |                         |-- connect ------>|
  |                       |                               |                         |<-- ok / error ---|
  |                       |                               |   log "email sent" or   |                  |
  |                       |                               |   log "delivery failed" |                  |
```

Step details:

1. The admin submits a status change. `require_admin` rejects non-admins (403) before any business logic runs.
2. The service checks the transition map. Illegal transitions raise 409 `invalid_status_transition`; a note-less OPEN -> RESOLVED raises 422 `note_required_for_direct_resolution`. On rejection, nothing is written and no email is enqueued.
3. The status update, `resolved_at` stamping, and history row commit atomically — the audit entry cannot exist without the status change and vice versa.
4. Only after commit is the email task registered. The response returns immediately without waiting for SMTP.
5. The background task composes the email to the resident's address (old status, new status, optional admin note) and delivers it. Failure is logged only.

Priority changes do not trigger this flow — they write no history and send no email.

## Flow 2: Important Notice Creation

Actors: Admin (initiator), API route, notice service, NotificationService, all active Residents.

```
Admin                    API                          Service/DB                Background            SMTP
  |                       |                               |                         |                  |
  | POST /api/v1/notices  |                               |                         |                  |
  |  {title, content,     |                               |                         |                  |
  |   is_important:true}  |                               |                         |                  |
  |---------------------->| require_admin (JWT)           |                         |                  |
  |                       | insert notice                 |                         |                  |
  |                       | COMMIT                        |                         |                  |
  |                       |<------------------------------|                         |                  |
  |                       | if is_important:              |                         |                  |
  |                       |   enqueue fan-out task        |                         |                  |
  |                       |-------------------------------------------------------->|                  |
  |<-- 201 NoticeOut -----|                               |                         | open own session  |
  |                       |                               |                         |--- SELECT emails -|
  |                       |                               |                         |<-- [residents] ---|
  |                       |                               |                         | for each email:   |
  |                       |                               |                         |-- connect ------->|
  |                       |                               |                         |<-- ok / error ----|
  |                       |                               |   log per-recipient     |                  |
  |                       |                               |   result; exceptions    |                  |
  |                       |                               |   logged, never raised  |                  |
```

Step details:

1. The admin creates a notice with `is_important: true`.
2. The notice commits first; the fan-out task is enqueued only afterwards, so a validation failure or rollback produces no emails.
3. The background task opens its own short-lived session (`SessionLocal`) because the request session has been closed, selects the addresses of all users with role `RESIDENT` and `is_active = true`, then sends one email per recipient (subject `Important Society Notice: <title>`, body containing the full content). Recipients are not batched into a single message; one recipient's failure does not stop the remaining sends.
4. Any unexpected exception in the task is caught and logged (`failed to notify residents of important notice`). The API response was already returned in step 2 and is unaffected.

Non-important notices skip step 3 entirely.

### Why toggling importance later does not resend

The trigger condition lives exclusively in the create route (`if notice.is_important: enqueue`). `PATCH /notices/{id}` never touches the notification path, so flipping `is_important` on an existing notice — in either direction — changes only listing order. This is intentional: it prevents accidental mass re-mailing and keeps "who was notified" equivalent to "who existed when an important notice was created".

## Testing Note

Because `EMAIL_ENABLED=false` in tests (set by `backend/tests/conftest.py`), both flows are exercised end-to-end except the actual SMTP hop: transactions commit, background tasks run inside TestClient requests, and each attempted send logs a skip line. To observe real delivery locally, set `EMAIL_ENABLED=true` plus `SMTP_HOST`, `SMTP_PORT`, and credentials in `.env`.

## Production Provider (Resend)

The NotificationService targets SMTP only, which keeps the provider swappable. Resend exposes a standard
SMTP relay, so production configuration requires no code change:

`
EMAIL_ENABLED=true
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USERNAME=resend
SMTP_PASSWORD=<RESEND_API_KEY>
EMAIL_FROM="Society Portal <verified@your-domain>"
`

The API key is read from the environment at send time and is never logged. Delivery failures are caught,
logged, and never propagate into request handling or database transactions.
