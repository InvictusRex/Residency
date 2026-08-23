from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin
from app.db.session import get_db
from app.schemas.dashboard import OverdueThresholdUpdateRequest, SystemSettingsOut
from app.services import settings_service

router = APIRouter(prefix="/admin/settings", tags=["Settings"])


@router.get(
    "",
    summary="Get system settings",
    description=(
        "Returns the current system settings (admin only), including the overdue "
        "threshold in days. Falls back to the default (3 days) when unset."
    ),
    response_model=SystemSettingsOut,
)
def get_settings_route(
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    return SystemSettingsOut(
        overdue_threshold_days=settings_service.get_overdue_threshold(db)
    )


@router.patch(
    "/overdue-threshold",
    summary="Update overdue threshold",
    description=(
        "Updates the overdue threshold in days (admin only). Accepted range is "
        "1..365. Defaults to 3 via the OVERDUE_THRESHOLD_DAYS environment "
        "variable. The change takes effect immediately on overdue detection in "
        "the dashboard and any overdue-based queries."
    ),
    response_model=SystemSettingsOut,
)
def update_overdue_threshold_route(
    data: OverdueThresholdUpdateRequest,
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    row = settings_service.set_overdue_threshold(db, data.overdue_threshold_days)
    return SystemSettingsOut(overdue_threshold_days=int(row.value))
