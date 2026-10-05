"""Knowledge domains + query classifier (AC43).

The reference architecture separates retrieval into Product / Brand / Marketing / Asset knowledge
and routes a query to the right one. Here that routing is a controlled, permission-scoped layer:
- **product** / **asset** → the approved catalog, resolved through the visibility choke-point and
  hybrid-ranked (AC44); assets are the subset with images.
- **brand** → the agent's own brand kit + their board's brand (never another tenant's).
- **marketing** → the agent's own past activity.

The classifier is deterministic; auth is enforced in code (the choke-point / the agent's own ids),
never by the model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.base import AIProvider
from app.models.agent_features import BrandKit
from app.models.catalog import CatalogEntry
from app.models.composition import Composition
from app.models.user import Tenant, User
from app.services import retrieval, visibility

# Deliberate precedence (brand → asset → marketing → product). Ambiguous common words ("logo",
# "history", "results") are left out so they don't hijack an ordinary content search.
_BRAND_RE = re.compile(r"\b(brand|guidelines?|tone|typography|font)\b")
_ASSET_RE = re.compile(
    r"\b(image|images|photo|photos|picture|pictures|asset|assets|video|videos)\b"
)
_MARKETING_RE = re.compile(r"\b(campaign|campaigns|performance|analytics|engagement)\b")


@dataclass(frozen=True)
class KnowledgeResult:
    domain: str
    entries: list[CatalogEntry] = field(default_factory=list)
    note: str = ""


def classify_domain(query: str) -> str:
    low = (query or "").lower()
    if _BRAND_RE.search(low):  # explicit brand wins even if "logo/image" also appears
        return "brand"
    if _ASSET_RE.search(low):
        return "asset"
    if _MARKETING_RE.search(low):
        return "marketing"
    return "product"


def retrieve(
    db: Session, agent: User, query: str, provider: AIProvider, *, now: datetime, limit: int = 8
) -> KnowledgeResult:
    """Route the query to its knowledge domain and return scoped, grounded results."""
    domain = classify_domain(query)
    visible = visibility.agent_visible_entries(db, agent, now=now)

    if domain in ("product", "asset"):
        pool = [e for e in visible if e.asset_keys] if domain == "asset" else visible
        ranked = retrieval.rank_entries(db, query, pool, provider, limit=limit)
        return KnowledgeResult(domain=domain, entries=ranked)

    if domain == "brand":
        kit = db.execute(select(BrandKit).where(BrandKit.agent_id == agent.id)).scalar_one_or_none()
        tenant = db.get(Tenant, agent.tenant_id) if agent.tenant_id else None
        bits = []
        if kit:
            bits.append(f"Your brand kit: primary {kit.primary_color}, accent {kit.accent_color}")
            if kit.contact_name:
                bits.append(f"contact {kit.contact_name}")
        if tenant and tenant.blurb:
            bits.append(f"Board: {tenant.blurb}")
        note = ". ".join(bits) if bits else "No brand details on file yet."
        return KnowledgeResult(domain=domain, note=note)

    # marketing — the agent's own activity only
    comps = db.scalar(
        select(func.count()).select_from(Composition).where(Composition.agent_id == agent.id)
    )
    note = f"You have {comps or 0} saved composition(s). Use suggestions for what to send next."
    return KnowledgeResult(domain=domain, note=note)
