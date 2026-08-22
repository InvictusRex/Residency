from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin
from app.db.session import get_db
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import build_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/summary",
    summary="Complaints dashboard summary",
    description=(
        "Returns aggregated complaint statistics (admin only): total complaints, "
        "counts per status, counts per category ordered by count descending, and "
        "the number of overdue complaints based on the configured overdue threshold."
    ),
    response_model=DashboardSummary,
)
def get_summary_route(
    admin: object = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    return build_summary(db)
