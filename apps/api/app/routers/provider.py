"""Provider workspace endpoints (AC29): media library, team members, content performance.

All provider-owned and scoped to the signed-in provider / their organization (tenant).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.catalog import Asset, CatalogEntry
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post
from app.models.user import Role, User
from app.schemas.auth import UserOut
from app.schemas.provider import (
    MediaItem,
    PerformanceOut,
    PerformanceRow,
    TeamInvite,
    TeamMember,
    TrendPoint,
)
from app.security import hash_password

router = APIRouter(prefix="/me", tags=["provider"])

_provider_only = require_role(Role.content_provider)


@router.get("/media", response_model=list[MediaItem])
def media_library(
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> list[MediaItem]:
    """Every image/asset across this provider's catalog entries, in one place (AC29)."""
    rows = db.execute(
        select(Asset, CatalogEntry.title, CatalogEntry.id)
        .join(CatalogEntry, Asset.entry_id == CatalogEntry.id)
        .where(CatalogEntry.provider_id == provider.id)
        .order_by(Asset.id.desc())
    ).all()
    return [
        MediaItem(
            object_key=asset.object_key,
            content_type=asset.content_type,
            entry_id=entry_id,
            entry_title=title,
        )
        for asset, title, entry_id in rows
    ]


@router.get("/team", response_model=list[TeamMember])
def team_members(
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> list[TeamMember]:
    """Colleagues in the same organization (tenant) (AC29)."""
    if provider.tenant_id is None:
        return []
    members = (
        db.execute(
            select(User)
            .where(User.tenant_id == provider.tenant_id, User.role == Role.content_provider)
            .order_by(User.id)
        )
        .scalars()
        .all()
    )
    return [
        TeamMember(id=u.id, email=u.email, display_name=u.display_name, approved=u.approved)
        for u in members
    ]


@router.post("/team", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def invite_member(
    body: TeamInvite,
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> User:
    """Invite a colleague into the organization (AC29). They join the provider's tenant and, since
    the organization is already onboarded, are usable immediately."""
    if provider.tenant_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No organization for this account")
    if db.execute(select(User).where(User.email == body.email)).scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    member = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=Role.content_provider,
        tenant_id=provider.tenant_id,
        approved=True,
        display_name=body.display_name,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/performance", response_model=PerformanceOut)
def content_performance(
    db: Session = Depends(get_db),
    provider: User = Depends(_provider_only),
) -> PerformanceOut:
    """How agents use this provider's content (AC29): compositions that reference each entry, and
    the reach (impressions) of posts built from them. Derived from seeded/mock engagement."""
    entries = (
        db.execute(select(CatalogEntry).where(CatalogEntry.provider_id == provider.id))
        .scalars()
        .all()
    )
    comps = db.execute(select(Composition)).scalars().all()

    entry_ids = {e.id for e in entries}
    post_comp = dict(db.execute(select(Post.id, Post.composition_id)).all())
    # Compositions (and thus posts) that actually reference this provider's content.
    used_comp_ids = {c.id for c in comps if entry_ids.intersection(c.item_ids or [])}
    relevant_posts = {pid for pid, cid in post_comp.items() if cid in used_comp_ids}

    def _reach(m: dict) -> int:
        return int(m.get("reach", m.get("views", 0)) or 0)

    def _engagements(m: dict) -> int:
        inter = m.get("total_interactions")
        if inter is None:
            inter = sum(int(m.get(k, 0) or 0) for k in ("likes", "comments", "saved", "shares"))
        return int(inter or 0)

    # One pass over snapshots (ascending fetched_at): the LATEST snapshot per post drives the
    # per-entry totals; every snapshot feeds the day-by-day trend (for this provider's posts only).
    reach_by_post: dict[int, int] = {}
    eng_by_post: dict[int, int] = {}
    trend_reach: dict[str, int] = {}
    trend_eng: dict[str, int] = {}
    eng_rows = db.execute(
        select(Engagement.post_id, Engagement.metrics, Engagement.fetched_at).order_by(
            Engagement.fetched_at
        )
    ).all()
    for post_id, metrics, fetched_at in eng_rows:
        m = metrics or {}
        r, e = _reach(m), _engagements(m)
        reach_by_post[post_id] = r  # last write wins = latest snapshot
        eng_by_post[post_id] = e
        if post_id in relevant_posts and fetched_at is not None:
            day = fetched_at.date().isoformat()
            trend_reach[day] = trend_reach.get(day, 0) + r
            trend_eng[day] = trend_eng.get(day, 0) + e

    reach_by_comp: dict[int, int] = {}
    eng_by_comp: dict[int, int] = {}
    for post_id, comp_id in post_comp.items():
        if comp_id is None:
            continue
        reach_by_comp[comp_id] = reach_by_comp.get(comp_id, 0) + reach_by_post.get(post_id, 0)
        eng_by_comp[comp_id] = eng_by_comp.get(comp_id, 0) + eng_by_post.get(post_id, 0)

    rows: list[PerformanceRow] = []
    for entry in entries:
        using = [c for c in comps if entry.id in (c.item_ids or [])]
        reach = sum(reach_by_comp.get(c.id, 0) for c in using)
        engagements = sum(eng_by_comp.get(c.id, 0) for c in using)
        rows.append(
            PerformanceRow(
                entry_id=entry.id,
                title=entry.title,
                uses=len(using),
                reach=reach,
                engagements=engagements,
            )
        )

    rows.sort(key=lambda r: (r.reach, r.engagements, r.uses), reverse=True)
    trend = [
        TrendPoint(date=day, reach=trend_reach[day], engagements=trend_eng.get(day, 0))
        for day in sorted(trend_reach)
    ]
    return PerformanceOut(
        total_uses=sum(r.uses for r in rows),
        total_reach=sum(r.reach for r in rows),
        total_engagements=sum(r.engagements for r in rows),
        rows=rows,
        trend=trend,
    )
