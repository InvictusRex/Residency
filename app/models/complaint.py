import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ComplaintPriority, ComplaintStatus
from app.db.base import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    resident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    priority: Mapped[ComplaintPriority] = mapped_column(
        Enum(
            ComplaintPriority,
            name="complaint_priority",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=ComplaintPriority.LOW,
        nullable=False,
        index=True,
    )
    status: Mapped[ComplaintStatus] = mapped_column(
        Enum(
            ComplaintStatus,
            name="complaint_status",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=ComplaintStatus.OPEN,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    resident: Mapped["User"] = relationship(back_populates="complaints")
    category: Mapped["Category"] = relationship(back_populates="complaints")
    history: Mapped[list["ComplaintHistory"]] = relationship(
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="ComplaintHistory.created_at",
        passive_deletes=True,
    )
