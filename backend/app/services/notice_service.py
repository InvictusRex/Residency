import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import Role
from app.core.exceptions import NotFoundError
from app.db.session import SessionLocal
from app.models.notice import Notice
from app.models.user import User
from app.schemas.notice import (
    AuthorBrief,
    NoticeCreateRequest,
    NoticeOut,
    NoticeUpdateRequest,
)
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)


def serialize_notice(notice: Notice) -> NoticeOut:
    return NoticeOut(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        is_important=notice.is_important,
        created_by=AuthorBrief(id=notice.author.id, name=notice.author.name),
        created_at=notice.created_at,
        updated_at=notice.updated_at,
    )


def create_notice(db: Session, admin: User, data: NoticeCreateRequest) -> Notice:
    notice = Notice(
        title=data.title,
        content=data.content,
        is_important=data.is_important,
        created_by=admin.id,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    return notice


def list_notices(db: Session, limit: int, offset: int) -> tuple[list[Notice], int]:
    total: int = int(
        db.execute(select(func.count()).select_from(Notice)).scalar_one()
    )
    items: list[Notice] = (
        db.query(Notice)
        .order_by(Notice.is_important.desc(), Notice.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return items, total


def get_notice_or_404(db: Session, notice_id: uuid.UUID) -> Notice:
    notice: Notice | None = db.get(Notice, notice_id)
    if notice is None:
        raise NotFoundError("notice_not_found")
    return notice


def update_notice(db: Session, notice: Notice, data: NoticeUpdateRequest) -> Notice:
    updates: dict[str, object] = data.model_dump(exclude_unset=True)
    if "title" in updates and isinstance(updates["title"], str):
        notice.title = updates["title"]
    if "content" in updates and isinstance(updates["content"], str):
        notice.content = updates["content"]
    if "is_important" in updates and isinstance(updates["is_important"], bool):
        notice.is_important = updates["is_important"]
    db.commit()
    db.refresh(notice)
    return notice


def delete_notice(db: Session, notice: Notice) -> None:
    db.delete(notice)
    db.commit()


def notify_residents_of_important_notice(
    notice_title: str, notice_content: str
) -> None:
    try:
        db = SessionLocal()
        try:
            emails: list[str] = list(
                db.execute(
                    select(User.email).where(
                        User.role == Role.RESIDENT,
                        User.is_active.is_(True),
                    )
                ).scalars().all()
            )
        finally:
            db.close()
        for email in emails:
            notification_service.send_important_notice_email(
                email, notice_title, notice_content
            )
    except Exception:
        logger.exception("failed to notify residents of important notice")
