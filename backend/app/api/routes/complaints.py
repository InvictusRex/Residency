import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, require_admin, require_resident
from app.core.enums import ComplaintPriority, ComplaintStatus
from app.core.exceptions import FileUploadError, NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.schemas.complaint import ComplaintListResponse, ComplaintOut, NoteCreateRequest, PriorityUpdateRequest, StatusUpdateRequest
from app.schemas.complaint_history import HistoryEntryOut, HistoryListResponse
from app.services import complaint_service
from app.services.notification_service import notification_service
from app.services.storage_service import storage_service

router = APIRouter(tags=["Complaints"])


@router.post(
    "/complaints",
    summary="Create a complaint",
    description="Creates a complaint as the authenticated resident with optional photo upload. The initial OPEN transition is recorded in history.",
    response_model=ComplaintOut,
    status_code=201,
    responses={404: {"description": "Category not found"}, 422: {"description": "Validation or file upload error"}},
)
async def create_complaint(
    category_id: uuid.UUID = Form(...),
    description: str = Form(..., min_length=5, max_length=5000),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    resident: User = Depends(require_resident),
) -> ComplaintOut:
    uploaded: tuple[bytes, str, str] | None = None
    if photo is not None:
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        data = await photo.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise FileUploadError("file_too_large")
        content_type = photo.content_type or ""
        filename = photo.filename or ""
        uploaded = (data, filename, content_type)
    complaint = complaint_service.create_complaint(db, resident, category_id, description, uploaded)
    return complaint_service.complaint_to_out(complaint)


@router.get(
    "/complaints",
    summary="List complaints",
    description="Lists complaints with pagination and filters. Residents see only their own complaints; admins see all with overdue-first default ordering.",
    response_model=ComplaintListResponse,
    responses={401: {"description": "Not authenticated"}, 422: {"description": "Validation error"}},
)
def list_complaints(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category_id: uuid.UUID | None = Query(default=None),
    status: ComplaintStatus | None = Query(default=None),
    priority: ComplaintPriority | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    overdue: bool | None = Query(default=None),
    sort: str | None = Query(default=None, pattern="^(newest|oldest|priority|triage|overdue)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ComplaintListResponse:
    items, total = complaint_service.list_complaints(
        db, user, limit, offset, category_id, status, priority, date_from, date_to, overdue, sort
    )
    return ComplaintListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[complaint_service.complaint_to_out(item) for item in items],
    )


@router.get(
    "/complaints/{complaint_id}",
    summary="Get a complaint",
    description="Returns a single complaint. Residents can only access their own complaints.",
    response_model=ComplaintOut,
    responses={401: {"description": "Not authenticated"}, 404: {"description": "Complaint not found"}},
)
def get_complaint(
    complaint_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ComplaintOut:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, user)
    return complaint_service.complaint_to_out(complaint)


@router.get(
    "/complaints/{complaint_id}/photo",
    summary="Get complaint photo",
    description=(
        "Streams the photo attached to a complaint through an authenticated endpoint. "
        "Residents can only access their own complaint photos; admins can access any. "
        "Returns 404 when the complaint has no photo or the stored file is missing. "
        "The internal storage path is never exposed."
    ),
    response_class=FileResponse,
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not allowed to view this complaint"},
        404: {"description": "Complaint, photo or underlying file not found"},
    },
)
def get_complaint_photo(
    complaint_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, user)
    if not complaint.photo_path:
        raise NotFoundError("photo_not_found")
    file_path = storage_service.resolve_file(complaint.photo_path)
    if file_path is None:
        raise NotFoundError("photo_not_found")
    return FileResponse(
        file_path,
        media_type=storage_service.media_type_for(complaint.photo_path),
    )


@router.get(
    "/complaints/{complaint_id}/history",
    summary="Get complaint history",
    description="Returns the full status-transition history of a complaint in chronological order.",
    response_model=HistoryListResponse,
    tags=["Complaint History"],
    responses={401: {"description": "Not authenticated"}, 404: {"description": "Complaint not found"}},
)
def get_complaint_history(
    complaint_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HistoryListResponse:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, user)
    entries = complaint_service.list_history(db, complaint)
    return HistoryListResponse(complaint_id=complaint.id, items=list(entries))


@router.post(
    "/complaints/{complaint_id}/notes",
    summary="Post a progress update",
    description=(
        "Admin-only. Appends a progress note to the complaint's immutable history timeline "
        "without changing its status. Rejected once the complaint is RESOLVED (closed)."
    ),
    response_model=HistoryEntryOut,
    status_code=201,
    responses={
        403: {"description": "Admin role required"},
        404: {"description": "Complaint not found"},
        422: {"description": "Validation error or resolved complaint is closed"},
    },
)
def add_complaint_note(
    complaint_id: uuid.UUID,
    payload: NoteCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> HistoryEntryOut:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, admin)
    entry = complaint_service.add_progress_note(db, complaint, admin, payload.note)
    return HistoryEntryOut.model_validate(entry)


@router.patch(
    "/complaints/{complaint_id}/status",
    summary="Update complaint status",
    description=(
        "Admin-only status update enforcing the transition map "
        "(OPEN -> IN_PROGRESS/RESOLVED, IN_PROGRESS -> RESOLVED). The status change and its history row are committed "
        "in a single atomic transaction. The resident notification email is dispatched via background task only after "
        "the transaction commits."
    ),
    response_model=ComplaintOut,
    responses={
        400: {"description": "Invalid status value"},
        403: {"description": "Admin role required"},
        404: {"description": "Complaint not found"},
        409: {"description": "Invalid status transition"},
        422: {"description": "Note required for direct resolution"},
    },
)
def update_complaint_status(
    complaint_id: uuid.UUID,
    payload: StatusUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ComplaintOut:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, admin)
    complaint, old_status = complaint_service.update_status(
        db, complaint, admin, payload.status, payload.note
    )
    background_tasks.add_task(
        notification_service.send_complaint_status_changed_email,
        recipient=complaint.resident.email,
        resident_name=complaint.resident.name,
        complaint_id=str(complaint.id),
        category_name=complaint.category.name,
        old_status=old_status.value,
        new_status=complaint.status.value,
        note=payload.note,
    )
    return complaint_service.complaint_to_out(complaint)


@router.patch(
    "/complaints/{complaint_id}/priority",
    summary="Update complaint priority",
    description="Admin-only priority update. Priority changes intentionally do not create history entries.",
    response_model=ComplaintOut,
    responses={
        403: {"description": "Admin role required"},
        404: {"description": "Complaint not found"},
        422: {"description": "Validation error"},
    },
)
def update_complaint_priority(
    complaint_id: uuid.UUID,
    payload: PriorityUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ComplaintOut:
    complaint = complaint_service.get_complaint_scoped(db, complaint_id, admin)
    complaint = complaint_service.update_priority(db, complaint, payload.priority)
    return complaint_service.complaint_to_out(complaint)
