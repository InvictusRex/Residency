import argparse
import sys
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.enums import ComplaintPriority, ComplaintStatus, Role
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Category, Complaint, ComplaintHistory, Notice, User

DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_ADMIN_PASSWORD = "Admin123!ChangeMe"
DEFAULT_RESIDENT_EMAIL = "resident@example.com"
DEFAULT_RESIDENT_PASSWORD = "Resident123!ChangeMe"

SAMPLE_CATEGORIES = [
    ("Plumbing", "Water supply, drainage and sanitary issues"),
    ("Electrical", "Wiring, lighting and power-related problems"),
    ("Security", "Gates, guards and access control concerns"),
    ("Cleaning", "Housekeeping and waste management"),
    ("Other", "Anything that does not fit another category"),
]


def ensure_user(
    db, name: str, email: str, password: str, role: Role
) -> tuple[User, bool]:
    existing = db.scalar(select(User).where(User.email == email.lower()))
    if existing is not None:
        return existing, False
    user = User(
        name=name,
        email=email.lower(),
        password_hash=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, True


def ensure_categories(db) -> tuple[dict[str, Category], list[str]]:
    created_names: list[str] = []
    by_name: dict[str, Category] = {}
    for name, description in SAMPLE_CATEGORIES:
        category = db.scalar(select(Category).where(Category.name == name))
        if category is None:
            category = Category(name=name, description=description, is_active=True)
            db.add(category)
            db.commit()
            db.refresh(category)
            created_names.append(name)
        by_name[name] = category
    return by_name, created_names


def create_sample_data(db, admin: User, resident: User, categories: dict[str, Category]) -> None:
    if db.scalar(select(Complaint).limit(1)) is not None:
        return
    samples = [
        (categories["Plumbing"], "Kitchen tap is leaking continuously since morning.", ComplaintStatus.OPEN, ComplaintPriority.LOW, None),
        (categories["Electrical"], "Corridor lights on the third floor are flickering.", ComplaintStatus.IN_PROGRESS, ComplaintPriority.MEDIUM, "Electrician scheduled for inspection"),
        (categories["Cleaning"], "Garbage has not been collected from B wing for two days.", ComplaintStatus.RESOLVED, ComplaintPriority.HIGH, "Housekeeping crew dispatched"),
    ]
    for category, description, status, priority, note in samples:
        complaint = Complaint(
            resident_id=resident.id,
            category_id=category.id,
            description=description,
            priority=priority,
            status=status,
        )
        if status == ComplaintStatus.RESOLVED:
            from datetime import datetime, timezone

            complaint.resolved_at = datetime.now(timezone.utc)
        db.add(complaint)
        db.flush()
        history_entries = [
            ComplaintHistory(
                complaint_id=complaint.id,
                status=ComplaintStatus.OPEN,
                actor_id=resident.id,
                note="Complaint created",
            )
        ]
        if status != ComplaintStatus.OPEN:
            history_entries.append(
                ComplaintHistory(
                    complaint_id=complaint.id,
                    status=ComplaintStatus.IN_PROGRESS,
                    actor_id=admin.id,
                    note=note or "Work started",
                )
            )
        if status == ComplaintStatus.RESOLVED:
            history_entries.append(
                ComplaintHistory(
                    complaint_id=complaint.id,
                    status=ComplaintStatus.RESOLVED,
                    actor_id=admin.id,
                    note=note or "Issue resolved",
                )
            )
        db.add_all(history_entries)
    notices = [
        Notice(title="Water tank cleaning on Saturday", content="The overhead tanks will be cleaned this Saturday between 9 AM and 1 PM. Please store water accordingly.", is_important=False, created_by=admin.id),
        Notice(title="Emergency: Lift maintenance outage", content="Lift A will be non-operational tomorrow due to mandatory safety maintenance. Kindly use Lift B or the staircase.", is_important=True, created_by=admin.id),
    ]
    db.add_all(notices)
    db.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed development data")
    parser.add_argument(
        "--with-sample-data",
        action="store_true",
        help="Also create sample complaints and notices",
    )
    args = parser.parse_args()
    db = SessionLocal()
    try:
        admin, admin_created = ensure_user(
            db, "Society Admin", DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, Role.ADMIN
        )
        resident, resident_created = ensure_user(
            db, "Demo Resident", DEFAULT_RESIDENT_EMAIL, DEFAULT_RESIDENT_PASSWORD, Role.RESIDENT
        )
        categories, created_categories = ensure_categories(db)
        sample_note = "skipped"
        if args.with_sample_data:
            create_sample_data(db, admin, resident, categories)
            sample_note = "created"
        print(f"admin={admin.email} created={admin_created}")
        print(f"resident={resident.email} created={resident_created}")
        print(f"categories_total={len(categories)} created={created_categories}")
        print(f"sample_data={sample_note} environment={settings.ENVIRONMENT}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
