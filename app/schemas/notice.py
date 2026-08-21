import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class NoticeCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=3, max_length=20000)
    is_important: bool = False

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "title": "Water supply maintenance",
                    "content": "Water supply will be interrupted on Saturday from 10 AM to 1 PM for tank cleaning.",
                    "is_important": True,
                }
            ]
        }
    }


class NoticeUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    content: str | None = Field(default=None, min_length=3, max_length=20000)
    is_important: bool | None = None


class AuthorBrief(BaseModel):
    id: uuid.UUID
    name: str


class NoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    is_important: bool
    created_by: AuthorBrief
    created_at: datetime
    updated_at: datetime


NoticeListResponse = PaginatedResponse[NoticeOut]
