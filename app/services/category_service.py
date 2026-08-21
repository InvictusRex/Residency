import uuid

from sqlalchemy.orm import Session

from app.core.enums import Role
from app.core.exceptions import ConflictError, NotFoundError
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreateRequest, CategoryUpdateRequest


def get_category_or_404(db: Session, category_id: uuid.UUID) -> Category:
    category: Category | None = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("category_not_found")
    return category


def list_categories(db: Session, current_user: User) -> list[Category]:
    query = db.query(Category)
    if current_user.role != Role.ADMIN:
        query = query.filter(Category.is_active.is_(True))
    return list(query.order_by(Category.name).all())


def create_category(db: Session, data: CategoryCreateRequest) -> Category:
    existing: Category | None = (
        db.query(Category).filter(Category.name == data.name.strip()).first()
    )
    if existing is not None:
        raise ConflictError("category_already_exists")
    category = Category(name=data.name.strip(), description=data.description)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(
    db: Session,
    category_id: uuid.UUID,
    data: CategoryUpdateRequest,
) -> Category:
    category = get_category_or_404(db, category_id)
    updates: dict[str, object] = data.model_dump(exclude_unset=True)
    new_name = updates.get("name")
    if isinstance(new_name, str):
        stripped_name = new_name.strip()
        duplicate: Category | None = (
            db.query(Category)
            .filter(Category.name == stripped_name, Category.id != category.id)
            .first()
        )
        if duplicate is not None:
            raise ConflictError("category_already_exists")
        category.name = stripped_name
    if "description" in updates:
        category.description = updates["description"]
    if "is_active" in updates and isinstance(updates["is_active"], bool):
        category.is_active = updates["is_active"]
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: uuid.UUID) -> Category:
    category = get_category_or_404(db, category_id)
    category.is_active = False
    db.commit()
    db.refresh(category)
    return category
