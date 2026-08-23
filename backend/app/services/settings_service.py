import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.setting import SystemSetting

logger = logging.getLogger(__name__)

OVERDUE_THRESHOLD_DAYS_KEY = "overdue_threshold_days"


def get_overdue_threshold(db: Session) -> int:
    row: SystemSetting | None = db.get(SystemSetting, OVERDUE_THRESHOLD_DAYS_KEY)
    if row is None:
        return settings.OVERDUE_THRESHOLD_DAYS
    try:
        return int(row.value)
    except (TypeError, ValueError):
        logger.warning(
            "invalid stored value for %s: %r - falling back to default",
            OVERDUE_THRESHOLD_DAYS_KEY,
            row.value,
        )
        return settings.OVERDUE_THRESHOLD_DAYS


def set_overdue_threshold(db: Session, days: int) -> SystemSetting:
    row: SystemSetting = db.merge(
        SystemSetting(key=OVERDUE_THRESHOLD_DAYS_KEY, value=str(days))
    )
    db.commit()
    db.refresh(row)
    return row
