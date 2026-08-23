from fastapi import APIRouter

from app.api.routes import (
    admin_settings,
    auth,
    categories,
    complaints,
    dashboard,
    notices,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(categories.router)
api_router.include_router(complaints.router)
api_router.include_router(notices.router)
api_router.include_router(dashboard.router)
api_router.include_router(admin_settings.router)
