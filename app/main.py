import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.api.routes.health import router as health_router
from app.core.config import settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    openapi_tags: list[dict[str, str]] = [
        {"name": "Authentication", "description": "Login and token management."},
        {"name": "Users", "description": "User account administration."},
        {"name": "Complaints", "description": "Maintenance complaint lifecycle."},
        {"name": "Complaint History", "description": "Status change audit trail."},
        {"name": "Categories", "description": "Complaint category management."},
        {"name": "Notices", "description": "Society notice board."},
        {"name": "Dashboard", "description": "Aggregated statistics."},
        {"name": "Settings", "description": "Application configuration."},
        {"name": "Health", "description": "Service and database health probes."},
    ]

    application = FastAPI(
        title=settings.APP_NAME + " API",
        version="1.0.0",
        openapi_tags=openapi_tags,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = [
            {
                "loc": error.get("loc"),
                "msg": error.get("msg"),
                "type": error.get("type"),
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Validation failed",
                "code": "validation_error",
                "errors": errors,
            },
        )

    @application.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "code": "internal_error"},
        )

    application.include_router(api_router)
    application.include_router(health_router)
    application.mount(
        "/uploads",
        StaticFiles(directory=settings.UPLOAD_DIR, check_dir=False),
        name="uploads",
    )
    return application


app = create_app()
