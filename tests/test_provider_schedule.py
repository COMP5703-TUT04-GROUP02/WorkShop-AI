from tests.conftest import BOOKING_START, PNG_BYTES, create_booking


def _schedule_ids(client, provider):
    response = client.get(
        f"/provider/bookings/schedule?month={BOOKING_START:%Y-%m}", headers=provider
    )
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()["data"]}


def _pay(client, customer, booking_id, **body):
    checkout = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout", **body},
        headers=customer,
    )
    assert checkout.status_code == 200, checkout.text
    callback = client.post(
        "/payments/iyzico/callback", data={"token": checkout.json()["data"]["token"]}
    )
    assert callback.status_code == 200, callback.text
    return callback.json()["data"]["booking"]["status"]


def _status(response):
    assert response.status_code == 200, response.text
    return response.json()["data"]["booking"]["status"]


def test_schedule_shows_bookings_from_visit_payment_to_confirmation(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    booking_id = create_booking(client, customer, marketplace["provider_profile"]["id"])["id"]
    visible = {}

    def record(status):
        visible[status] = booking_id in _schedule_ids(client, provider)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250, "visit_fee_amount": 40},
        headers=provider,
    )
    record(_status(client.put(f"/customer/bookings/{booking_id}/accept-quote", headers=customer)))
    record(_pay(client, customer, booking_id))
    record(_status(client.put(
        f"/provider/bookings/{booking_id}/start-visit",
        files=[("proof_files", ("arrival.png", PNG_BYTES, "image/png"))],
        headers=provider,
    )))
    record(_status(client.put(
        f"/provider/bookings/{booking_id}/final-quote",
        json={"quote_amount": 275},
        headers=provider,
    )))
    record(_status(client.put(
        f"/customer/bookings/{booking_id}/accept-final-quote", headers=customer
    )))
    record(_pay(client, customer, booking_id, payment_stage="service_fee"))
    record(_status(client.put(
        f"/provider/bookings/{booking_id}/complete",
        files=[("proof_files", ("proof.png", PNG_BYTES, "image/png"))],
        headers=provider,
    )))
    record(_status(client.put(
        f"/customer/bookings/{booking_id}/reject-complete",
        json={"status_note": "Leak is still there"},
        headers=customer,
    )))

    assert visible == {
        "awaiting_visit_payment": False,
        "visit_paid": True,
        "provider_arrived": True,
        "final_quote_sent": True,
        "awaiting_service_payment": True,
        "service_paid": True,
        "awaiting_confirmation": True,
        "accepted": True,
    }
