from datetime import datetime, timedelta, timezone

from backend import models
from backend.database import SessionLocal
from tests.conftest import create_booking


def _create_checkout(client, customer_headers, provider_profile_id):
    booking = create_booking(client, customer_headers, provider_profile_id)
    booking_id = booking["id"]
    return booking_id


def test_payment_checkout_is_idempotent_for_repeated_requests(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    quoted = client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250.50, "visit_fee_amount": 40, "quote_message": "Includes parts"},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    accepted = client.put(
        f"/customer/bookings/{booking_id}/accept-quote",
        headers=customer,
    )
    assert accepted.status_code == 200, accepted.text

    idempotency_key = "payment-test-repeat-1"
    first = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": idempotency_key},
    )
    second = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": idempotency_key},
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["data"]["payment"]["id"] == first.json()["data"]["payment"]["id"]
    assert second.json()["data"]["token"] == first.json()["data"]["token"]

    payments = client.get("/customer/payments", headers=customer)
    assert payments.status_code == 200, payments.text
    attempts = [
        payment
        for payment in payments.json()["data"]["items"]
        if payment["booking_id"] == booking_id
    ]
    assert len(attempts) == 1
    assert attempts[0]["status"] == "checkout_created"
    assert attempts[0]["idempotency_key"] == idempotency_key


def test_payment_checkout_can_restart_after_expiry_with_new_key(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250.50, "visit_fee_amount": 40, "quote_message": "Includes parts"},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)

    first = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": "payment-test-expiry-1"},
    )
    assert first.status_code == 200, first.text
    payment_id = first.json()["data"]["payment"]["id"]

    db = SessionLocal()
    try:
        payment = db.get(models.Payment, payment_id)
        payment.checkout_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    second = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": "payment-test-expiry-2"},
    )
    assert second.status_code == 200, second.text
    assert second.json()["data"]["payment"]["id"] != payment_id

    payments = client.get("/customer/payments", headers=customer)
    attempts = [
        payment
        for payment in payments.json()["data"]["items"]
        if payment["booking_id"] == booking_id
    ]
    assert len(attempts) == 2
    assert any(
        payment["status"] == "failed"
        and payment["failure_code"] == "checkout_expired"
        for payment in attempts
    )
    assert any(payment["status"] == "checkout_created" for payment in attempts)


def test_payment_callback_is_idempotent(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "visit_fee_amount": 30, "quote_message": "Labour only"},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    token = checkout.json()["data"]["token"]

    first = client.post("/payments/iyzico/callback", data={"token": token})
    second = client.post("/payments/iyzico/callback", data={"token": token})

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["data"]["payment"]["status"] == "paid"
    assert second.json()["data"]["payment"]["status"] == "paid"
    assert second.json()["data"]["booking"]["status"] == "visit_paid"


def test_payment_callback_returns_to_the_checkout_browser_origin(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "visit_fee_amount": 30},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)

    frontend_origin = "http://127.0.0.1:8090"
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={
            **customer,
            "Origin": "http://localhost:8090",
            "Idempotency-Key": "return-origin-test",
        },
    )
    assert checkout.status_code == 200, checkout.text

    continued_checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={
            **customer,
            "Origin": frontend_origin,
            "Idempotency-Key": "return-origin-test",
        },
    )
    assert continued_checkout.status_code == 200, continued_checkout.text
    assert continued_checkout.json()["data"]["token"] == checkout.json()["data"]["token"]

    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": checkout.json()["data"]["token"]},
        follow_redirects=False,
    )

    assert callback.status_code == 303, callback.text
    assert callback.headers["location"].startswith(
        f"{frontend_origin}/payment-result?booking_id={booking_id}&payment_status=paid"
    )


def test_payment_callback_rejects_amount_mismatch(client, marketplace, fake_iyzico):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "visit_fee_amount": 30, "quote_message": "Labour only"},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    fake_iyzico.retrieve_amount_override = "181"

    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": checkout.json()["data"]["token"]},
    )

    assert callback.status_code == 400
    assert "currency" not in callback.text.lower()
    assert "amount" in callback.text.lower()
