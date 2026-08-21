import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import ComplaintStatus, Role


class ActorBrief(BaseModel):
    id: uuid.UUID
    name: str
    role: Role


class HistoryEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ComplaintStatus
    note: str | None
    actor: ActorBrief
    created_at: datetime


class HistoryListResponse(BaseModel):
    complaint_id: uuid.UUID
    items: list[HistoryEntryOut]
