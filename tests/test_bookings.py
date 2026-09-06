from tests.conftest import PNG_BYTES, create_booking


def test_customer_bookings_require_auth(client):
    response = client.get("/customer/bookings")
    assert response.status_code == 401


def test_customer_profile_round_trip(client, marketplace):
    headers = marketplace["customer"]["headers"]
    created = client.post(
        "/customer/profile",
        json={
            "phone_number": "+905551112233",
            "address": "1 Demo Street",
            "service_province": "Istanbul",
            "latitude": 41.0082,
            "longitude": 28.9784,
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["data"]["profile"]["service_province"] == "Istanbul"

    fetched = client.get("/customer/profile", headers=headers)
    assert fetched.status_code == 200
    body = fetched.json()["data"]
    profile = body.get("profile", body)
    assert profile["phone_number"] == "+905551112233"


def test_booking_quote_pay_complete_review_flow(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]

    booking = create_booking(client, customer, provider_id)
    assert booking["status"] == "pending"
    booking_id = booking["id"]

    quoted = client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250.5, "quote_message": "Includes parts"},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    assert quoted.json()["data"]["booking"]["status"] == "quoted"

    accepted = client.put(
        f"/customer/bookings/{booking_id}/accept-quote",
        headers=customer,
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["booking"]["status"] == "awaiting_payment"

    paid = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "mock"},
        headers=customer,
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["data"]["booking"]["status"] == "accepted"
    assert paid.json()["data"]["payment"]["status"] == "paid"
    assert paid.json()["data"]["payment"]["currency"] == "TRY"

    completed = client.put(
        f"/provider/bookings/{booking_id}/complete",
        files=[("proof_files", ("proof.png", PNG_BYTES, "image/png"))],
        headers=provider,
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["data"]["booking"]["status"] == "awaiting_confirmation"

    confirmed = client.put(
        f"/customer/bookings/{booking_id}/confirm-complete",
        headers=customer,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["booking"]["status"] == "completed"

    reviewed = client.post(
        f"/bookings/{booking_id}/review",
        json={"rating": 5, "comment": "Arrived on time and fixed the leak."},
        headers=customer,
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["data"]["review"]["rating"] == 5

    public = client.get(f"/providers/{provider_id}/reviews")
    assert public.status_code == 200, public.text
    items = public.json()["data"]["items"]
    assert any(item["rating"] == 5 for item in items)


def test_refund_and_complaint_on_paid_booking(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    admin = marketplace["admin"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]

    booking_id = create_booking(client, customer, provider_id)["id"]
    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "quote_message": "Labour only"},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "mock"},
        headers=customer,
    )

    complaint = client.post(
        f"/bookings/{booking_id}/complaints",
        json={"reason": "Technician was two hours late"},
        headers=customer,
    )
    assert complaint.status_code == 200, complaint.text
    complaint_id = complaint.json()["data"]["complaint"]["id"]

    resolved = client.put(
        f"/admin/complaints/{complaint_id}/status",
        json={"status": "resolved", "admin_note": "Spoke with both parties"},
        headers=admin,
    )
    assert resolved.status_code == 200, resolved.text

    refund = client.post(
        f"/bookings/{booking_id}/refund-requests",
        json={"service_stage": "in_progress", "reason": "Work was not finished"},
        headers=customer,
    )
    assert refund.status_code == 200, refund.text
    refund_id = refund.json()["data"]["refund_request"]["id"]
    assert refund.json()["data"]["booking"]["status"] == "refunding"

    approved = client.put(
        f"/provider/refund-requests/{refund_id}/approve",
        headers=provider,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["booking"]["status"] == "refunded"


def test_unapproved_provider_cannot_be_booked(client):
    from tests.conftest import create_provider_profile, register_session

    customer = register_session(client, "c2@example.com", role="customer")
    provider = register_session(client, "p2@example.com", role="provider")
    profile = create_provider_profile(client, provider["headers"])
    response = client.post(
        "/bookings",
        data={
            "provider_profile_id": str(profile["id"]),
            "service_description": "Tap repair",
            "service_address": "Kadikoy, Istanbul",
            "service_latitude": "40.990",
            "service_longitude": "29.030",
            "scheduled_start_time": "2026-10-05T10:00:00+00:00",
            "scheduled_end_time": "2026-10-05T12:00:00+00:00",
        },
        headers=customer["headers"],
    )
    assert response.status_code == 400
