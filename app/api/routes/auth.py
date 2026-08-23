from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.exceptions import AppError
from app.core.rate_limit import SlidingWindowRateLimiter
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.models.user import User
from app.schemas.user import UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

auth_rate_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60.0)


def enforce_auth_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    if not auth_rate_limiter.allow(client_ip):
        raise AppError(429, "rate_limited", "Too many authentication attempts. Try again later.")


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new resident account",
    description="Creates a new resident account with the given name, email, and password.",
    responses={
        201: {"model": UserOut, "description": "Account created"},
        409: {"model": None, "description": "email_already_registered"},
    },
)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
    _: None = Depends(enforce_auth_rate_limit),
) -> UserOut:
    user = auth_service.register_user(db, data)
    return UserOut.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Log in and receive an access token",
    description=(
        "Authenticates with email and password and returns a bearer access token. "
        "The returned access_token can be used via the Swagger Authorize button "
        "(OAuth2PasswordBearer flow) to authenticate subsequent requests."
    ),
    responses={
        200: {"model": TokenResponse, "description": "Authenticated"},
        401: {"model": None, "description": "invalid_credentials"},
    },
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
    _: None = Depends(enforce_auth_rate_limit),
) -> TokenResponse:
    user = auth_service.authenticate_user(db, data.email, data.password)
    return auth_service.build_token_response(user)


@router.get(
    "/me",
    response_model=UserOut,
    status_code=status.HTTP_200_OK,
    summary="Get the current authenticated user",
    description="Returns the profile of the currently authenticated user.",
    responses={
        200: {"model": UserOut, "description": "Current user profile"},
        401: {"model": None, "description": "not_authenticated"},
    },
)
def read_current_user(
    current_user: User = Depends(get_current_user),
) -> UserOut:
    return UserOut.model_validate(current_user)
