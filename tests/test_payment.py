from datetime import datetime, timedelta, timezone

import pytest

from backend import models
from backend.database import SessionLocal
from tests.conftest import PNG_BYTES, create_booking


def _create_checkout(client, customer_headers, provider_profile_id):
    booking = create_booking(client, customer_headers, provider_profile_id)
    booking_id = booking["id"]
    return booking_id


@pytest.mark.parametrize("first_locale,second_locale", [("en", "tr"), ("tr", "en")])
def test_payment_checkout_is_idempotent_for_repeated_requests(
    client, marketplace, fake_iyzico, first_locale, second_locale
):
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
        headers={**customer, "Idempotency-Key": idempotency_key, "Accept-Language": first_locale},
    )
    second = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": idempotency_key, "Accept-Language": second_locale},
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["data"]["payment"]["id"] == first.json()["data"]["payment"]["id"]
    assert second.json()["data"]["token"] == first.json()["data"]["token"]
    assert len(fake_iyzico.sessions) == 1
    assert next(iter(fake_iyzico.sessions.values()))["locale"] == first_locale

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


@pytest.mark.parametrize("payment_stage", ["visit_fee", "service_fee"])
def test_failed_checkout_can_retry_with_new_key(
    client, marketplace, fake_iyzico, monkeypatch, payment_stage
):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    booking_id = _create_checkout(
        client, customer, marketplace["provider_profile"]["id"]
    )
    quoted = client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250.50, "visit_fee_amount": 40},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    accepted = client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    assert accepted.status_code == 200, accepted.text

    if payment_stage == "service_fee":
        visit_checkout = client.put(
            f"/customer/bookings/{booking_id}/pay",
            json={"payment_method": "iyzico_checkout"},
            headers={**customer, "Idempotency-Key": "visit-before-retry"},
        )
        assert visit_checkout.status_code == 200, visit_checkout.text
        visit_callback = client.post(
            "/payments/iyzico/callback",
            data={"token": visit_checkout.json()["data"]["token"]},
        )
        assert visit_callback.status_code == 200, visit_callback.text
        started = client.put(
            f"/provider/bookings/{booking_id}/start-visit",
            files=[("proof_files", ("arrival.png", PNG_BYTES, "image/png"))],
            headers=provider,
        )
        assert started.status_code == 200, started.text
        final_quote = client.put(
            f"/provider/bookings/{booking_id}/final-quote",
            json={"quote_amount": 275},
            headers=provider,
        )
        assert final_quote.status_code == 200, final_quote.text
        final_accept = client.put(
            f"/customer/bookings/{booking_id}/accept-final-quote",
            headers=customer,
        )
        assert final_accept.status_code == 200, final_accept.text

    original_initialize = fake_iyzico.initialize_checkout_form
    initialization_count = 0

    async def fail_once(payload):
        nonlocal initialization_count
        initialization_count += 1
        if initialization_count == 1:
            return {"status": "failure", "errorMessage": "Simulated checkout failure"}
        return await original_initialize(payload)

    monkeypatch.setattr(fake_iyzico, "initialize_checkout_form", fail_once)
    payment_payload = {
        "payment_method": "iyzico_checkout",
        "payment_stage": payment_stage,
    }
    first = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json=payment_payload,
        headers={**customer, "Idempotency-Key": f"{payment_stage}-failed"},
    )
    assert first.status_code == 502, first.text

    same_key = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json=payment_payload,
        headers={**customer, "Idempotency-Key": f"{payment_stage}-failed"},
    )
    assert same_key.status_code == 200, same_key.text
    assert same_key.json()["data"]["payment"]["status"] == "failed"
    assert initialization_count == 1

    retry = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json=payment_payload,
        headers={**customer, "Idempotency-Key": f"{payment_stage}-retry"},
    )
    assert retry.status_code == 200, retry.text
    assert retry.json()["data"]["payment_page_url"]
    assert retry.json()["data"]["payment"]["status"] == "checkout_created"
    assert retry.json()["data"]["payment"]["id"] != same_key.json()["data"]["payment"]["id"]
    assert initialization_count == 2

    payments = client.get("/customer/payments", headers=customer)
    assert payments.status_code == 200, payments.text
    stage_attempts = [
        item
        for item in payments.json()["data"]["items"]
        if item["booking_id"] == booking_id and item["payment_stage"] == payment_stage
    ]
    assert {item["status"] for item in stage_attempts} == {"failed", "checkout_created"}


def test_retry_does_not_create_checkout_for_already_paid_stage(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    booking_id = _create_checkout(
        client, customer, marketplace["provider_profile"]["id"]
    )
    quoted = client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250, "visit_fee_amount": 40},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    accepted = client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    assert accepted.status_code == 200, accepted.text
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": "paid-stage-first"},
    )
    assert checkout.status_code == 200, checkout.text
    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": checkout.json()["data"]["token"]},
    )
    assert callback.status_code == 200, callback.text

    db = SessionLocal()
    try:
        booking = db.get(models.Booking, booking_id)
        booking.status = "awaiting_visit_payment"
        db.commit()
    finally:
        db.close()

    retry = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers={**customer, "Idempotency-Key": "paid-stage-retry"},
    )
    assert retry.status_code == 409, retry.text
    payments = client.get("/customer/payments", headers=customer)
    stage_attempts = [
        item
        for item in payments.json()["data"]["items"]
        if item["booking_id"] == booking_id and item["payment_stage"] == "visit_fee"
    ]
    assert len(stage_attempts) == 1
    assert stage_attempts[0]["status"] == "paid"

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
