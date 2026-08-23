from fastapi import APIRouter
from sqlalchemy import text

from app.core.exceptions import AppError
from app.db.session import engine

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Service health", description="Returns service liveness status.")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get(
    "/health/db",
    summary="Database health",
    description="Verifies database connectivity with a trivial query.",
)
def health_db() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        raise AppError(503, "database_unavailable", "Database connection failed") from None
    return {"status": "ok", "database": "ok"}
