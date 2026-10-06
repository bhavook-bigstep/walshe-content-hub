"""Campaign model + Post.campaign_id / status vocabulary (Inc 1 Tasks 1-2)."""

from datetime import date, datetime, timezone

from app.db import create_all, make_engine, make_sessionmaker
from app.models.campaign import Campaign, CampaignStatus
from app.models.post import Post, PostStatus


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


def test_post_campaign_id_optional_and_new_statuses(tmp_path):
    engine = make_engine(f"sqlite+pysqlite:///{tmp_path}/p.db")
    create_all(engine)
    with make_sessionmaker(engine)() as db:
        campaign = Campaign(
            agent_id=1, name="Test", starts_on=date(2026, 8, 1), ends_on=date(2026, 8, 31),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        )
        db.add(campaign)
        db.flush()  # assign a real campaign id for the FK (don't rely on an invented value)
        legacy = Post(composition_id=1, channel="instagram")  # campaign_id stays None
        linked = Post(composition_id=1, channel="instagram", campaign_id=campaign.id,
                      status=PostStatus.pending_approval)
        db.add_all([legacy, linked])
        db.commit()
        assert legacy.campaign_id is None
        assert linked.campaign_id == campaign.id
        assert PostStatus.pending_approval.value == "pending_approval"
        assert {"draft", "approved", "publishing", "rejected", "cancelled"} <= {
            s.value for s in PostStatus
        }
