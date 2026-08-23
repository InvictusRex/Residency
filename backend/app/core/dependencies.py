from typing import TYPE_CHECKING, Any

import uuid
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDeniedError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db

if TYPE_CHECKING:
    from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Any:
    from app.models.user import User

    if token is None:
        raise UnauthorizedError("not_authenticated")
    payload = decode_access_token(token)
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise UnauthorizedError("not_authenticated")
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise UnauthorizedError("not_authenticated") from None
    user: User | None = db.get(User, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("inactive_or_missing_user")
    return user


def require_admin(user: Any = Depends(get_current_user)) -> Any:
    if getattr(user, "role", None) != "ADMIN":
        raise PermissionDeniedError("admin_required")
    return user


def require_resident(user: Any = Depends(get_current_user)) -> Any:
    if getattr(user, "role", None) != "RESIDENT":
        raise PermissionDeniedError("resident_required")
    return user
