import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.enums import ComplaintPriority, ComplaintStatus
from app.schemas.common import PaginatedResponse


class ResidentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr


class CategoryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ComplaintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    description: str
    photo_url: str | None
    priority: ComplaintPriority
    status: ComplaintStatus
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    resident: ResidentBrief
    category: CategoryBrief


ComplaintListResponse = PaginatedResponse[ComplaintOut]


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "status": "IN_PROGRESS",
                    "note": "Plumber assigned, visit scheduled.",
                }
            ]
        },
    )

    status: ComplaintStatus
    note: str | None = Field(default=None, max_length=2000)


class PriorityUpdateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "priority": "HIGH",
                }
            ]
        },
    )

    priority: ComplaintPriority


class NoteCreateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "note": "Plumber arrived, replacing the valve.",
                }
            ]
        },
    )

    note: str = Field(min_length=1, max_length=2000)
