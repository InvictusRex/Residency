import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import Role
from app.core.exceptions import NotFoundError
from app.models.user import User


def list_residents(
    db: Session,
    limit: int,
    offset: int,
    is_active: bool | None = None,
    search: str | None = None,
) -> tuple[list[User], int]:
    filters = [User.role == Role.RESIDENT]
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))
    if search:
        term = search.strip().lower()
        if term:
            filters.append(
                (func.lower(User.name).contains(term)) | (func.lower(User.email).contains(term))
            )
    total: int = int(
        db.execute(select(func.count()).select_from(User).where(*filters)).scalar_one()
    )
    items: list[User] = list(
        db.execute(
            select(User)
            .where(*filters)
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars().all()
    )
    return items, total


def get_resident_or_404(db: Session, user_id: uuid.UUID) -> User:
    user: User | None = db.get(User, user_id)
    if user is None or user.role != Role.RESIDENT:
        raise NotFoundError("resident_not_found")
    return user


def set_resident_active(db: Session, user_id: uuid.UUID, is_active: bool) -> User:
    user = get_resident_or_404(db, user_id)
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user