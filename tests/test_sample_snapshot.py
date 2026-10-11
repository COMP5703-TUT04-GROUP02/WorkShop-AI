from collections import Counter
from pathlib import Path

from backend.auth import verify_password
from scripts.build_sample_snapshot import PASSWORD_HASH, TAGS, build


def _rows(snapshot, table):
    return next(group["rows"] for group in snapshot["tables"] if group["table"] == table)


def test_sample_snapshot_has_reviewed_account_and_display_counts():
    snapshot = build()
    users = _rows(snapshot, "users")
    profiles = _rows(snapshot, "provider_profiles")
    bookings = _rows(snapshot, "bookings")
    reviews = _rows(snapshot, "reviews")

    assert len(users) == 36
    assert users[0]["values"]["email"] == "demo_admin@workshop.ai"
    assert [row["values"]["email"] for row in users[1:6]] == [
        f"demo_customer_{index}@workshop.ai" for index in range(1, 6)
    ]
    assert [row["values"]["email"] for row in users[6:]] == [
        f"demo_provider_{index}@workshop.ai" for index in range(1, 31)
    ]
    assert len(profiles) == 30
    assert len(bookings) == 300
    assert len(reviews) == 300
    assert verify_password("Demo1234", PASSWORD_HASH)


def test_sample_providers_cover_every_tag_and_use_draft_payout_accounts():
    snapshot = build()
    coverage = Counter()
    for profile in _rows(snapshot, "provider_profiles"):
        coverage.update(profile["values"]["tags"].split(","))

    assert set(coverage) == set(TAGS)
    assert all(coverage[tag] >= 5 for tag in TAGS)
    assert coverage == Counter({tag: 6 for tag in TAGS})

    submerchants = _rows(snapshot, "provider_submerchants")
    assert len(submerchants) == 30
    assert {row["values"]["iban"] for row in submerchants} == {
        "TR180006200119000006672315"
    }
    assert {row["values"]["status"] for row in submerchants} == {"draft"}
    assert {row["values"]["submerchant_key"] for row in submerchants} == {None}


def test_sample_provider_locations_and_portfolios_match_service_categories():
    snapshot = build()
    profiles = _rows(snapshot, "provider_profiles")
    service_areas = _rows(snapshot, "provider_service_areas")
    portfolios = _rows(snapshot, "provider_portfolios")
    portfolio_media = _rows(snapshot, "provider_portfolio_media")

    assert len(profiles) == 30
    assert {
        row["values"]["service_location_id"]["ref"] for row in profiles
    } == {"location:tr-istanbul"}
    assert {
        row["values"]["service_location_id"]["ref"] for row in service_areas
    } == {"location:tr-istanbul"}
    assert len(portfolios) == 60
    assert len(portfolio_media) == 60
    assert {row["values"]["verification_status"] for row in portfolios} == {
        "approved"
    }
    assert {
        row["values"]["image_url"]
        .split("?", 1)[0]
        .rsplit("/", 1)[-1]
        .removesuffix(".png")
        for row in portfolios
    } == set(TAGS)
    media_dir = Path("backend/sample_media/service_categories")
    assert {path.stem for path in media_dir.glob("*.png")} == set(TAGS)


def test_sample_order_states_and_reviews_are_consistent():
    snapshot = build()
    bookings = _rows(snapshot, "bookings")
    statuses = Counter(row["values"]["status"] for row in bookings)
    booking_by_key = {row["key"]: row["values"] for row in bookings}

    assert statuses == {"completed": 300}
    assert len(_rows(snapshot, "booking_quote_revisions")) == 300
    assert len(_rows(snapshot, "reviews")) == 300
    for review in _rows(snapshot, "reviews"):
        booking_key = review["values"]["booking_id"]["ref"]
        assert booking_by_key[booking_key]["status"] == "completed"
        assert review["values"]["customer_id"] == booking_by_key[booking_key]["customer_id"]
        assert review["values"]["provider_profile_id"] == booking_by_key[booking_key][
            "provider_profile_id"
        ]
