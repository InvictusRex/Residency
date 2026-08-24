from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserOut


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not any(c.isupper() for c in value):
            raise ValueError("password_too_weak")
        if not any(c.islower() for c in value):
            raise ValueError("password_too_weak")
        if not any(c.isdigit() for c in value):
            raise ValueError("password_too_weak")
        return value

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Asha Resident",
                    "email": "asha.resident@society.example",
                    "password": "Adm1nSecure9",
                }
            ]
        }
    }


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "asha.resident@society.example",
                    "password": "Adm1nSecure9",
                }
            ]
        }
    }


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str
