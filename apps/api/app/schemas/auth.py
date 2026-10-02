from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.models.user import Role


def _validate_email(value: str) -> str:
    value = value.strip()
    # Minimal shape check (no email-validator dependency in this PoC): one @, a dotted domain.
    local, _, domain = value.partition("@")
    if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
        raise ValueError("Enter a valid email address")
    return value.lower()


class LoginRequest(BaseModel):
    # Plain str (not EmailStr) to avoid the optional email-validator dependency in this PoC.
    email: str
    password: str


class RegisterRequest(BaseModel):
    """Public self-registration (AC24a) — only ever creates a Tourism Agent."""

    email: str
    password: str = Field(min_length=8, max_length=200)

    _email = field_validator("email")(_validate_email)


class AdminCreateUserRequest(BaseModel):
    """Super-Admin user provisioning (AC24b). Role is validated in the route (no super_admin)."""

    email: str
    password: str = Field(min_length=8, max_length=200)
    role: Role
    organization: str | None = Field(default=None, max_length=200)

    _email = field_validator("email")(_validate_email)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    role: Role
    tenant_id: int | None
    approved: bool
