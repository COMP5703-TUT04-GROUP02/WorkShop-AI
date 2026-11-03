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


def _open_visit_fee_checkout(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    booking_id = _create_checkout(client, customer, marketplace["provider_profile"]["id"])
    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "visit_fee_amount": 30},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert checkout.status_code == 200, checkout.text
    return booking_id, checkout.json()["data"]["token"]


def _cancel_then_pay_on_the_open_page(client, marketplace):
    booking_id, token = _open_visit_fee_checkout(client, marketplace)
    cancelled = client.put(
        f"/customer/bookings/{booking_id}/cancel", headers=marketplace["customer"]["headers"]
    )
    assert cancelled.status_code == 200, cancelled.text
    # The iyzico page was still open, and the customer paid on it anyway.
    return token, client.post("/payments/iyzico/callback", data={"token": token})


def _settlement_count(token):
    with SessionLocal() as db:
        payment = db.query(models.Payment).filter_by(iyzico_token=token).one()
        return db.query(models.PaymentSettlement).filter_by(payment_id=payment.id).count()


def test_payment_after_the_booking_was_cancelled_is_cancelled_at_iyzico(
    client, marketplace, fake_iyzico, monkeypatch
):
    cancels = []
    original_cancel = fake_iyzico.cancel_payment

    async def record_cancel(payment_id, conversation_id):
        cancels.append(payment_id)
        return await original_cancel(payment_id, conversation_id)

    monkeypatch.setattr(fake_iyzico, "cancel_payment", record_cancel)

    token, callback = _cancel_then_pay_on_the_open_page(client, marketplace)

    assert callback.status_code == 200, callback.text
    data = callback.json()["data"]
    assert data["payment"]["status"] == "voided"
    assert data["payment"]["failure_code"] == "booking_not_awaiting_payment"
    assert data["booking"]["status"] == "cancelled"
    assert cancels == [f"iyzico-payment-{token}"]
    assert _settlement_count(token) == 0

    again = client.post("/payments/iyzico/callback", data={"token": token})
    assert again.json()["data"]["payment"]["status"] == "voided"
    assert len(cancels) == 1


def test_late_payment_is_refunded_when_iyzico_refuses_the_cancel(
    client, marketplace, fake_iyzico, monkeypatch
):
    async def refuse_cancel(payment_id, conversation_id):
        return {"status": "failure", "errorMessage": "Cancel window closed"}

    monkeypatch.setattr(fake_iyzico, "cancel_payment", refuse_cancel)

    token, callback = _cancel_then_pay_on_the_open_page(client, marketplace)

    assert callback.status_code == 200, callback.text
    assert callback.json()["data"]["payment"]["status"] == "refunded"
    assert _settlement_count(token) == 0


def test_late_payment_callback_can_retry_when_iyzico_returns_nothing(
    client, marketplace, fake_iyzico, monkeypatch
):
    original_cancel = fake_iyzico.cancel_payment

    async def refuse(*args):
        return {"status": "failure", "errorMessage": "iyzico is unavailable"}

    monkeypatch.setattr(fake_iyzico, "cancel_payment", refuse)
    monkeypatch.setattr(fake_iyzico, "refund_payment", refuse)

    token, callback = _cancel_then_pay_on_the_open_page(client, marketplace)
    assert callback.status_code == 502

    monkeypatch.setattr(fake_iyzico, "cancel_payment", original_cancel)
    retried = client.post("/payments/iyzico/callback", data={"token": token})

    assert retried.status_code == 200, retried.text
    assert retried.json()["data"]["payment"]["status"] == "voided"

