from tests.conftest import PNG_BYTES, create_booking


def test_customer_bookings_require_auth(client):
    response = client.get("/customer/bookings")
    assert response.status_code == 401


def test_legacy_payment_routes_are_removed(client):
    create_payment = client.post(
        "/bookings/1/payments",
        json={"payment_method": "iyzico_checkout"},
    )
    pay_payment = client.put("/payments/1/pay")

    assert create_payment.status_code == 404
    assert pay_payment.status_code == 404


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
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["data"]["booking"]["status"] == "awaiting_payment"
    assert paid.json()["data"]["payment"]["status"] == "checkout_created"
    assert paid.json()["data"]["payment"]["currency"] == "TRY"
    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": paid.json()["data"]["token"]},
    )
    assert callback.status_code == 200, callback.text
    assert callback.json()["data"]["booking"]["status"] == "accepted"
    assert callback.json()["data"]["payment"]["status"] == "authorized"

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
    assert confirmed.json()["data"]["payment"]["status"] == "paid"

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
    paid = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert paid.status_code == 200, paid.text
    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": paid.json()["data"]["token"]},
    )
    assert callback.status_code == 200, callback.text

    early_refund = client.post(
        f"/bookings/{booking_id}/refund-requests",
        json={"reason": "Refund requested before completion"},
        headers=customer,
    )
    assert early_refund.status_code == 400, early_refund.text

    completed = client.put(
        f"/provider/bookings/{booking_id}/complete",
        files=[("proof_files", ("proof.png", PNG_BYTES, "image/png"))],
        headers=provider,
    )
    assert completed.status_code == 200, completed.text
    confirmed = client.put(
        f"/customer/bookings/{booking_id}/confirm-complete",
        headers=customer,
    )
    assert confirmed.status_code == 200, confirmed.text

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
        json={"reason": "Work was not finished"},
        headers=customer,
    )
    assert refund.status_code == 200, refund.text
    refund_id = refund.json()["data"]["refund_request"]["id"]
    assert refund.json()["data"]["booking"]["status"] == "refunding"

    provider_cancel_attempt = client.put(
        f"/refund-requests/{refund_id}/cancel",
        headers=provider,
    )
    assert provider_cancel_attempt.status_code == 403, provider_cancel_attempt.text

    cancelled = client.put(
        f"/refund-requests/{refund_id}/cancel",
        headers=customer,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["booking"]["status"] == "completed"

    retry = client.post(
        f"/bookings/{booking_id}/refund-requests",
        json={"reason": "Work was still not finished", "refund_amount": 90},
        headers=customer,
    )
    assert retry.status_code == 200, retry.text
    retry_id = retry.json()["data"]["refund_request"]["id"]
    assert retry_id != refund_id

    approved = client.put(
        f"/provider/refund-requests/{retry_id}/approve",
        headers=provider,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["booking"]["status"] == "partially_refunded"
    refund_details = approved.json()["data"]["booking"]["current_refund_request"]
    assert refund_details["status"] == "approved"
    assert refund_details["reason"] == "Work was still not finished"
    assert refund_details["refund_amount"] == 90.0

    second_successful_refund = client.post(
        f"/bookings/{booking_id}/refund-requests",
        json={"reason": "A second successful refund should not be possible"},
        headers=customer,
    )
    assert second_successful_refund.status_code == 400, second_successful_refund.text
    assert "successful refund" in second_successful_refund.text


def test_changed_final_quote_reauthorizes_before_capture(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = create_booking(client, customer, provider_id)["id"]

    assert client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "quote_message": "Initial quote"},
        headers=provider,
    ).status_code == 200
    assert client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer).status_code == 200
    initial = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert initial.status_code == 200, initial.text
    assert client.post(
        "/payments/iyzico/callback", data={"token": initial.json()["data"]["token"]}
    ).status_code == 200

    completed = client.put(
        f"/provider/bookings/{booking_id}/complete",
        data={"final_quote_amount": "220", "final_quote_message": "Additional parts"},
        files=[("proof_files", ("proof.png", PNG_BYTES, "image/png"))],
        headers=provider,
    )
    assert completed.status_code == 200, completed.text

    reauthorization = client.put(
        f"/customer/bookings/{booking_id}/confirm-complete", headers=customer
    )
    assert reauthorization.status_code == 200, reauthorization.text
    assert reauthorization.json()["data"]["booking"]["status"] == "awaiting_payment"
    replacement_token = reauthorization.json()["data"]["token"]
    authorized = client.post(
        "/payments/iyzico/callback", data={"token": replacement_token}
    )
    assert authorized.status_code == 200, authorized.text
    assert authorized.json()["data"]["booking"]["status"] == "awaiting_confirmation"

    captured = client.put(
        f"/customer/bookings/{booking_id}/confirm-complete", headers=customer
    )
    assert captured.status_code == 200, captured.text
    assert captured.json()["data"]["booking"]["status"] == "completed"
    assert captured.json()["data"]["payment"]["status"] == "paid"


def test_unapproved_provider_cannot_be_booked(client):
    from tests.conftest import create_provider_profile, register_session

    customer = register_session(client, "c2@example.com", role="customer")
    provider = register_session(client, "p2@example.com", role="provider")
    profile = create_provider_profile(client, provider["headers"])
    response = client.post(
        "/bookings",
        data={
            "provider_profile_id": str(profile["id"]),
            "title": "Tap repair",
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
