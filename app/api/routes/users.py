from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.schemas.user import UserOut, UserUpdateRequest

router = APIRouter(prefix="/users", tags=["Users"])


@router.patch(
    "/me",
    response_model=UserOut,
    status_code=status.HTTP_200_OK,
    summary="Update the current user's profile",
    description="Updates the authenticated user's own profile fields (currently only name).",
    responses={
        200: {"model": UserOut, "description": "Profile updated"},
        401: {"model": None, "description": "not_authenticated"},
        422: {"model": None, "description": "Validation error"},
    },
)
def update_current_user(
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> UserOut:
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and isinstance(updates["name"], str):
        current_user.name = updates["name"].strip()
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)
