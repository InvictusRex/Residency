import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_admin
from app.db.session import get_db
from app.schemas.common import MessageResponse
from app.schemas.notice import (
    NoticeCreateRequest,
    NoticeListResponse,
    NoticeOut,
    NoticeUpdateRequest,
)
from app.services.notice_service import (
    create_notice,
    delete_notice,
    get_notice_or_404,
    list_notices,
    notify_residents_of_important_notice,
    serialize_notice,
    update_notice,
)

router = APIRouter(prefix="/notices", tags=["Notices"])


@router.post(
    "",
    summary="Create notice",
    description=(
        "Creates a new notice (admin only). If the notice is created as important, "
        "email notifications are sent to all active residents in the background. "
        "Notifications fire only on creation."
    ),
    response_model=NoticeOut,
    status_code=status.HTTP_201_CREATED,
)
def create_notice_route(
    data: NoticeCreateRequest,
    background_tasks: BackgroundTasks,
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> NoticeOut:
    notice = create_notice(db, admin, data)
    if notice.is_important:
        background_tasks.add_task(
            notify_residents_of_important_notice, notice.title, notice.content
        )
    return serialize_notice(notice)


@router.get(
    "",
    summary="List notices",
    description=(
        "Returns a paginated list of notices ordered by importance first, "
        "then newest first. Requires authentication."
    ),
    response_model=NoticeListResponse,
)
def list_notices_route(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoticeListResponse:
    items, total = list_notices(db, limit, offset)
    return NoticeListResponse(
        total=total, limit=limit, offset=offset, items=[serialize_notice(n) for n in items]
    )


@router.get(
    "/{notice_id}",
    summary="Get notice",
    description="Returns a single notice by id. Requires authentication.",
    response_model=NoticeOut,
    responses={404: {"description": "Notice not found"}},
)
def get_notice_route(
    notice_id: uuid.UUID,
    current_user: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoticeOut:
    return serialize_notice(get_notice_or_404(db, notice_id))


@router.patch(
    "/{notice_id}",
    summary="Update notice",
    description=(
        "Updates the provided fields of an existing notice (admin only). "
        "Toggling is_important does NOT resend email notifications."
    ),
    response_model=NoticeOut,
    responses={404: {"description": "Notice not found"}},
)
def update_notice_route(
    notice_id: uuid.UUID,
    data: NoticeUpdateRequest,
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> NoticeOut:
    notice = update_notice(db, get_notice_or_404(db, notice_id), data)
    return serialize_notice(notice)


@router.delete(
    "/{notice_id}",
    summary="Delete notice",
    description="Permanently deletes a notice (admin only).",
    response_model=MessageResponse,
    responses={404: {"description": "Notice not found"}},
)
def delete_notice_route(
    notice_id: uuid.UUID,
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MessageResponse:
    notice = get_notice_or_404(db, notice_id)
    delete_notice(db, notice)
    return MessageResponse(message="notice_deleted")
