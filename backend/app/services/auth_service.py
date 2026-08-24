from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.enums import Role
from app.core.exceptions import ConflictError, UnauthorizedError, ValidationError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse


def register_user(db: Session, data: RegisterRequest) -> User:
    normalized_email: str = data.email.lower()
    existing: User | None = (
        db.query(User).filter(User.email == normalized_email).first()
    )
    if existing is not None:
        raise ConflictError("email_already_registered")
    user = User(
        name=data.name.strip(),
        email=normalized_email,
        password_hash=hash_password(data.password),
        role=Role.RESIDENT,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    normalized_email: str = email.lower()
    user: User | None = (
        db.query(User).filter(User.email == normalized_email).first()
    )
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("invalid_credentials")
    if not user.is_active:
        raise UnauthorizedError("invalid_credentials")
    return user


def build_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user,
    )


def change_email(db: Session, user: User, email: str, current_password: str) -> User:
    if not verify_password(current_password, user.password_hash):
        raise ValidationError("current_password_incorrect")
    normalized_email: str = email.lower()
    existing: User | None = (
        db.query(User).filter(User.email == normalized_email, User.id != user.id).first()
    )
    if existing is not None:
        raise ConflictError("email_already_registered")
    user.email = normalized_email
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise ValidationError("current_password_incorrect")
    user.password_hash = hash_password(new_password)
    db.commit()
