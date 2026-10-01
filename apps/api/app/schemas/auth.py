from __future__ import annotations

from pydantic import BaseModel

from app.models.user import Role


class LoginRequest(BaseModel):
    # Plain str (not EmailStr) to avoid the optional email-validator dependency in this PoC.
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    role: Role
    tenant_id: int | None
    approved: bool
