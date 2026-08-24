import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import ResidentListResponse, ResidentUpdateRequest, UserOut
from app.services import resident_service

router = APIRouter(prefix="/admin/residents", tags=["Residents"])


@router.get(
    "",
    response_model=ResidentListResponse,
    summary="List residents",
    description="Admin-only paginated list of resident accounts with optional status and search filters.",
    responses={
        401: {"model": None, "description": "Not authenticated"},
        403: {"model": None, "description": "Admin role required"},
        422: {"model": None, "description": "Validation error"},
    },
)
def list_residents(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResidentListResponse:
    items, total = resident_service.list_residents(db, limit, offset, is_active, search)
    return ResidentListResponse(total=total, limit=limit, offset=offset, items=items)


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    summary="Activate or deactivate a resident",
    description="Admin-only. Sets a resident account's is_active flag. Deactivated residents can no longer authenticate.",
    responses={
        401: {"model": None, "description": "Not authenticated"},
        403: {"model": None, "description": "Admin role required"},
        404: {"model": None, "description": "Resident not found"},
        422: {"model": None, "description": "Validation error"},
    },
)
def update_resident(
    user_id: uuid.UUID,
    payload: ResidentUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    user = resident_service.set_resident_active(db, user_id, payload.is_active)
    return UserOut.model_validate(user)