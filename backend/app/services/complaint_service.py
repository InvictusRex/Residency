import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import ComplaintPriority, ComplaintStatus, Role
from app.core.exceptions import (
    FileUploadError,
    InvalidTransitionError,
    NotFoundError,
    ValidationError,
)
from app.models.category import Category
from app.models.complaint import Complaint
from app.models.complaint_history import ComplaintHistory
from app.models.user import User
from app.schemas.complaint import ComplaintOut
from app.services import settings_service
from app.services.overdue_service import overdue_condition
from app.services.storage_service import storage_service

ALLOWED_TRANSITIONS: dict[ComplaintStatus, set[ComplaintStatus]] = {
    ComplaintStatus.OPEN: {ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED},
    ComplaintStatus.IN_PROGRESS: {ComplaintStatus.RESOLVED},
    ComplaintStatus.RESOLVED: set(),
}

_PRIORITY_ORDER: dict[ComplaintPriority, int] = {
    ComplaintPriority.HIGH: 0,
    ComplaintPriority.MEDIUM: 1,
    ComplaintPriority.LOW: 2,
}


def complaint_to_out(complaint: Complaint) -> ComplaintOut:
    return ComplaintOut(
        id=complaint.id,
        description=complaint.description,
        photo_url=f"/api/v1/complaints/{complaint.id}/photo" if complaint.photo_path else None,
        priority=complaint.priority,
        status=complaint.status,
        created_at=complaint.created_at,
        updated_at=complaint.updated_at,
        resolved_at=complaint.resolved_at,
        resident=complaint.resident,
        category=complaint.category,
    )


def _get_category_or_404(db: Session, category_id: uuid.UUID) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("category_not_found")
    if not category.is_active:
        raise ValidationError("category_inactive")
    return category


def create_complaint(
    db: Session,
    resident: User,
    category_id: uuid.UUID,
    description: str,
    photo: tuple[bytes, str, str] | None,
) -> Complaint:
    _get_category_or_404(db, category_id)
    cleaned_description = description.strip()
    if not cleaned_description:
        raise ValidationError("description_empty")
    stored = None
    if photo is not None:
        data, filename, content_type = photo
        try:
            stored = storage_service.save_file(data, filename, content_type)
        except ValueError as exc:
            raise FileUploadError(str(exc)) from None
    complaint = Complaint(
        resident_id=resident.id,
        category_id=category_id,
        description=cleaned_description,
        photo_path=stored.storage_path if stored else None,
        priority=ComplaintPriority.LOW,
        status=ComplaintStatus.OPEN,
    )
    db.add(complaint)
    db.flush()
    db.add(
        ComplaintHistory(
            complaint_id=complaint.id,
            status=ComplaintStatus.OPEN,
            actor_id=resident.id,
            note="Complaint created",
        )
    )
    db.commit()
    db.refresh(complaint)
    return complaint


def get_complaint_scoped(db: Session, complaint_id: uuid.UUID, user: User) -> Complaint:
    stmt = (
        select(Complaint)
        .options(selectinload(Complaint.resident), selectinload(Complaint.category))
        .where(Complaint.id == complaint_id)
    )
    complaint = db.execute(stmt).scalar_one_or_none()
    if complaint is None:
        raise NotFoundError("complaint_not_found")
    if user.role != Role.ADMIN and complaint.resident_id != user.id:
        raise NotFoundError("complaint_not_found")
    return complaint


def list_complaints(
    db: Session,
    user: User,
    limit: int,
    offset: int,
    category_id: uuid.UUID | None,
    status: ComplaintStatus | None,
    priority: ComplaintPriority | None,
    date_from: date | None,
    date_to: date | None,
    overdue: bool | None,
    sort: str | None,
) -> tuple[list[Complaint], int]:
    filters: list[Any] = []
    if user.role != Role.ADMIN:
        filters.append(Complaint.resident_id == user.id)
    if category_id is not None:
        filters.append(Complaint.category_id == category_id)
    if status is not None:
        filters.append(Complaint.status == status)
    if priority is not None:
        filters.append(Complaint.priority == priority)
    if date_from is not None and date_to is not None and date_from > date_to:
        raise ValidationError("invalid_date_range")
    if date_from is not None:
        filters.append(Complaint.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to is not None:
        filters.append(
            Complaint.created_at
            < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
        )
    threshold = settings_service.get_overdue_threshold(db)
    if overdue is True:
        filters.append(overdue_condition(threshold))
    elif overdue is False:
        filters.append(~overdue_condition(threshold))

    count_stmt: Select[tuple[int]] = select(func.count()).select_from(Complaint).where(*filters)
    total: int = db.execute(count_stmt).scalar_one()

    stmt = (
        select(Complaint)
        .options(selectinload(Complaint.resident), selectinload(Complaint.category))
        .where(*filters)
        .limit(limit)
        .offset(offset)
    )
    overdue_case = case((overdue_condition(threshold), 1), else_=0)
    priority_case = case(
        (Complaint.priority == ComplaintPriority.HIGH, 0),
        (Complaint.priority == ComplaintPriority.MEDIUM, 1),
        else_=2,
    )
    if sort == "oldest":
        stmt = stmt.order_by(Complaint.created_at.asc())
    elif sort == "priority":
        stmt = stmt.order_by(priority_case.asc(), Complaint.created_at.desc())
    elif sort == "newest":
        stmt = stmt.order_by(Complaint.created_at.desc())
    elif user.role != Role.ADMIN:
        stmt = stmt.order_by(Complaint.created_at.desc())
    else:
        stmt = stmt.order_by(overdue_case.desc(), priority_case.asc(), Complaint.created_at.desc())
    items = list(db.execute(stmt).scalars().all())
    return items, total


def update_priority(db: Session, complaint: Complaint, priority: ComplaintPriority) -> Complaint:
    complaint.priority = priority
    db.commit()
    db.refresh(complaint)
    return complaint


def update_status(
    db: Session,
    complaint: Complaint,
    actor: User,
    new_status: ComplaintStatus,
    note: str | None,
) -> tuple[Complaint, ComplaintStatus]:
    locked = db.execute(
        select(Complaint).where(Complaint.id == complaint.id).with_for_update()
    ).scalar_one()
    old_status = locked.status
    if new_status not in ALLOWED_TRANSITIONS[old_status]:
        raise InvalidTransitionError(
            f"cannot_transition_{old_status.value.lower()}_to_{new_status.value.lower()}"
        )
    if old_status == ComplaintStatus.OPEN and new_status == ComplaintStatus.RESOLVED:
        if note is None or not note.strip():
            raise ValidationError("note_required_for_direct_resolution")
    cleaned_note = note.strip() if isinstance(note, str) else note
    locked.status = new_status
    if new_status == ComplaintStatus.RESOLVED:
        locked.resolved_at = datetime.now(timezone.utc)
    db.add(
        ComplaintHistory(
            complaint_id=locked.id,
            status=new_status,
            actor_id=actor.id,
            note=cleaned_note,
        )
    )
    db.commit()
    db.refresh(locked)
    return locked, old_status


def list_history(db: Session, complaint: Complaint) -> list[ComplaintHistory]:
    stmt = (
        select(ComplaintHistory)
        .where(ComplaintHistory.complaint_id == complaint.id)
        .order_by(ComplaintHistory.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def add_progress_note(
    db: Session,
    complaint: Complaint,
    actor: User,
    note: str,
) -> ComplaintHistory:
    cleaned = note.strip()
    if not cleaned:
        raise ValidationError("note_required")
    if complaint.status == ComplaintStatus.RESOLVED:
        raise ValidationError("resolved_complaint_is_closed")
    entry = ComplaintHistory(
        complaint_id=complaint.id,
        status=complaint.status,
        actor_id=actor.id,
        note=cleaned,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
