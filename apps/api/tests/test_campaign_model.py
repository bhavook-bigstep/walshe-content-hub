"""Campaign model + Post.campaign_id / status vocabulary (Inc 1 Tasks 1-2)."""

from datetime import date, datetime, timezone

from app.db import create_all, make_engine, make_sessionmaker
from app.models.campaign import Campaign, CampaignStatus


def test_campaign_roundtrips_with_active_default(tmp_path):
    engine = make_engine(f"sqlite+pysqlite:///{tmp_path}/c.db")
    create_all(engine)
    with make_sessionmaker(engine)() as db:
        c = Campaign(
            agent_id=1, name="3N/4D Australia", destination="Australia",
            starts_on=date(2026, 8, 1), ends_on=date(2026, 8, 31),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        assert c.id is not None
        assert c.status == CampaignStatus.active
        assert c.destination == "Australia"
