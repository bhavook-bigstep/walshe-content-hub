"""Auth routes (AC1): login -> bearer token; me -> current user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps import get_current_user, get_db, get_settings
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    user = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token = create_token(
        secret=settings.jwt_secret,
        sub=user.id,
        role=user.role.value,
        tenant_id=user.tenant_id,
        ttl=settings.token_ttl_seconds,
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
