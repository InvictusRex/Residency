import uuid

from pydantic import BaseModel, Field

from app.core.enums import ComplaintStatus


class StatusCounts(BaseModel):
    OPEN: int
    IN_PROGRESS: int
    RESOLVED: int


class CategoryCount(BaseModel):
    category_id: uuid.UUID
    category_name: str
    count: int


class DashboardSummary(BaseModel):
    total_complaints: int
    by_status: StatusCounts
    by_category: list[CategoryCount]
    overdue_count: int


class SystemSettingsOut(BaseModel):
    overdue_threshold_days: int


class OverdueThresholdUpdateRequest(BaseModel):
    overdue_threshold_days: int = Field(ge=1, le=365)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "overdue_threshold_days": 7,
                }
            ]
        }
    }
