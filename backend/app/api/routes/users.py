from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.schemas.common import MessageResponse
from app.schemas.user import EmailUpdateRequest, PasswordChangeRequest, UserOut, UserUpdateRequest
from app.services import auth_service

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


@router.patch(
    "/me/email",
    response_model=UserOut,
    status_code=status.HTTP_200_OK,
    summary="Update the current user's email",
    description="Updates the authenticated user's email. The current password must be provided to authorize the change.",
    responses={
        200: {"model": UserOut, "description": "Email updated"},
        401: {"model": None, "description": "not_authenticated"},
        409: {"model": None, "description": "email_already_registered"},
        422: {"model": None, "description": "current_password_incorrect or validation error"},
    },
)
def update_current_email(
    data: EmailUpdateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> UserOut:
    user = auth_service.change_email(db, current_user, data.email, data.current_password)
    return UserOut.model_validate(user)


@router.patch(
    "/me/password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Change the current user's password",
    description="Changes the authenticated user's password. The current password must be provided; the new password must meet the same strength rules as registration.",
    responses={
        200: {"model": MessageResponse, "description": "Password updated"},
        401: {"model": None, "description": "not_authenticated"},
        422: {"model": None, "description": "current_password_incorrect, password_too_weak or validation error"},
    },
)
def change_own_password(
    data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> MessageResponse:
    auth_service.change_password(db, current_user, data.current_password, data.new_password)
    return MessageResponse(message="Password updated.")
