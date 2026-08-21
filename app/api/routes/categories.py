import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.category import (
    CategoryCreateRequest,
    CategoryOut,
    CategoryUpdateRequest,
)
from app.schemas.common import MessageResponse
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get(
    "",
    response_model=list[CategoryOut],
    status_code=status.HTTP_200_OK,
    summary="List complaint categories",
    description=(
        "Returns complaint categories. Residents see only active categories; "
        "admins see all categories including inactive ones."
    ),
    responses={
        200: {
            "model": list[CategoryOut],
            "description": "Categories listed",
        },
        401: {"model": None, "description": "not_authenticated"},
    },
)
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryOut]:
    categories = category_service.list_categories(db, current_user)
    return [CategoryOut.model_validate(c) for c in categories]


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a complaint category",
    description="Creates a new complaint category. Admins only.",
    responses={
        201: {"model": CategoryOut, "description": "Category created"},
        401: {"model": None, "description": "not_authenticated"},
        403: {"model": None, "description": "admin_required"},
        409: {"model": None, "description": "category_already_exists"},
    },
)
def create_category(
    data: CategoryCreateRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
) -> CategoryOut:
    category = category_service.create_category(db, data)
    return CategoryOut.model_validate(category)


@router.patch(
    "/{category_id}",
    response_model=CategoryOut,
    status_code=status.HTTP_200_OK,
    summary="Update a complaint category",
    description=(
        "Updates an existing complaint category. Admins only. An explicit null "
        "description clears it."
    ),
    responses={
        200: {"model": CategoryOut, "description": "Category updated"},
        401: {"model": None, "description": "not_authenticated"},
        403: {"model": None, "description": "admin_required"},
        404: {"model": None, "description": "category_not_found"},
        409: {"model": None, "description": "category_already_exists"},
    },
)
def update_category(
    category_id: uuid.UUID,
    data: CategoryUpdateRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
) -> CategoryOut:
    category = category_service.update_category(db, category_id, data)
    return CategoryOut.model_validate(category)


@router.delete(
    "/{category_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete a complaint category",
    description=(
        "Deactivates a complaint category (soft delete: is_active is set to False). "
        "Referenced categories are never physically deleted so historical complaints "
        "keep their category linkage. Admins only."
    ),
    responses={
        200: {"model": MessageResponse, "description": "Category deactivated"},
        401: {"model": None, "description": "not_authenticated"},
        403: {"model": None, "description": "admin_required"},
        404: {"model": None, "description": "category_not_found"},
    },
)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
) -> MessageResponse:
    category_service.delete_category(db, category_id)
    return MessageResponse(message="category_deactivated")
