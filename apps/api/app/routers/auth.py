"""Auth routes (AC1): login -> bearer token; me -> current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps import get_current_user, get_db, get_settings
from app.models.user import Role, User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    """Public self-registration (AC24): always a Tourism Agent — no role escalation. Signs in on
    success by returning a bearer token. Agents need no approval (that gate is for providers)."""
    exists = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=Role.tourism_agent,
        tenant_id=None,
        approved=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(
        secret=settings.jwt_secret,
        sub=user.id,
        role=user.role.value,
        tenant_id=user.tenant_id,
        ttl=settings.token_ttl_seconds,
    )
    return TokenResponse(access_token=token)


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
