"""Pure campaign-window validation (Inc 1 Task 3, design §4.1)."""

from datetime import date, datetime, timedelta, timezone

from app.services.campaign_schedule import within_campaign_window

START, END = date(2026, 8, 1), date(2026, 8, 31)
IST = timezone(timedelta(hours=5, minutes=30))


def test_in_window_inclusive_boundaries():
    assert within_campaign_window(datetime(2026, 8, 1, 9, tzinfo=timezone.utc), START, END)
    assert within_campaign_window(datetime(2026, 8, 31, 23, tzinfo=timezone.utc), START, END)


def test_before_and_after_window():
    assert not within_campaign_window(datetime(2026, 7, 31, 9, tzinfo=timezone.utc), START, END)
    assert not within_campaign_window(datetime(2026, 9, 1, 9, tzinfo=timezone.utc), START, END)


def test_local_date_from_submitted_offset_not_utc():
    # 2026-08-16 02:00 +05:30 == 2026-08-15 20:30Z. By LOCAL date it is 16 Aug (in window).
    assert within_campaign_window(datetime(2026, 8, 16, 2, 0, tzinfo=IST), START, END)
    # 2026-09-01 01:00 +05:30 == 2026-08-31 19:30Z, but LOCAL date is 1 Sep (out of window).
    assert not within_campaign_window(datetime(2026, 9, 1, 1, 0, tzinfo=IST), START, END)
