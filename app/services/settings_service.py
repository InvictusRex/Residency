from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.setting import SystemSetting

OVERDUE_THRESHOLD_DAYS_KEY = "overdue_threshold_days"


def get_overdue_threshold(db: Session) -> int:
    row: SystemSetting | None = db.get(SystemSetting, OVERDUE_THRESHOLD_DAYS_KEY)
    if row is None:
        return settings.OVERDUE_THRESHOLD_DAYS
    try:
        return int(row.value)
    except (TypeError, ValueError):
        return settings.OVERDUE_THRESHOLD_DAYS


def set_overdue_threshold(db: Session, days: int) -> SystemSetting:
    row: SystemSetting = db.merge(
        SystemSetting(key=OVERDUE_THRESHOLD_DAYS_KEY, value=str(days))
    )
    db.commit()
    db.refresh(row)
    return row
