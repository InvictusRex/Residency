import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.enums import Role
from app.schemas.common import PaginatedResponse


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr
    role: Role
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class EmailUpdateRequest(BaseModel):
    email: EmailStr
    current_password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, value: str) -> str:
        if not any(c.isupper() for c in value):
            raise ValueError("password_too_weak")
        if not any(c.islower() for c in value):
            raise ValueError("password_too_weak")
        if not any(c.isdigit() for c in value):
            raise ValueError("password_too_weak")
        return value


class ResidentUpdateRequest(BaseModel):
    is_active: bool


ResidentListResponse = PaginatedResponse[UserOut]
