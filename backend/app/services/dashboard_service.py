from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ComplaintStatus
from app.models.category import Category
from app.models.complaint import Complaint
from app.schemas.dashboard import CategoryCount, DashboardSummary, StatusCounts
from app.services import settings_service
from app.services.overdue_service import overdue_condition


def build_summary(db: Session) -> DashboardSummary:
    total_complaints: int = int(
        db.execute(select(func.count()).select_from(Complaint)).scalar_one()
    )

    status_rows = db.execute(
        select(Complaint.status, func.count()).group_by(Complaint.status)
    ).all()
    status_counts: dict[str, int] = {member.value: 0 for member in ComplaintStatus}
    for complaint_status, count in status_rows:
        status_counts[str(complaint_status.value)] = int(count)
    by_status = StatusCounts(
        OPEN=status_counts[ComplaintStatus.OPEN.value],
        IN_PROGRESS=status_counts[ComplaintStatus.IN_PROGRESS.value],
        RESOLVED=status_counts[ComplaintStatus.RESOLVED.value],
    )

    category_rows = db.execute(
        select(Category.id, Category.name, func.count(Complaint.id))
        .join(Complaint, Complaint.category_id == Category.id)
        .group_by(Category.id, Category.name)
        .order_by(func.count(Complaint.id).desc())
    ).all()
    by_category = [
        CategoryCount(category_id=row.id, category_name=row.name, count=int(row[2]))
        for row in category_rows
    ]

    threshold: int = settings_service.get_overdue_threshold(db)
    overdue_count: int = int(
        db.execute(
            select(func.count())
            .select_from(Complaint)
            .where(overdue_condition(threshold))
        ).scalar_one()
    )

    return DashboardSummary(
        total_complaints=total_complaints,
        by_status=by_status,
        by_category=by_category,
        overdue_count=overdue_count,
    )
