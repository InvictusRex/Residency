from datetime import datetime, timedelta, timezone

from sqlalchemy import ColumnElement, and_, func

from app.core.enums import ComplaintStatus
from app.models.complaint import Complaint


def is_complaint_overdue(complaint: Complaint, threshold_days: int) -> bool:
    return complaint.status != ComplaintStatus.RESOLVED and datetime.now(timezone.utc) > (
        complaint.created_at + timedelta(days=threshold_days)
    )


def overdue_condition(threshold_days: int) -> ColumnElement[bool]:
    return and_(
        Complaint.status != ComplaintStatus.RESOLVED,
        Complaint.created_at < func.now() - func.make_interval(0, 0, 0, threshold_days),
    )
