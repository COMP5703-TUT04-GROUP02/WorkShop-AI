from tests.conftest import create_booking


def _create_checkout(client, customer_headers, provider_profile_id):
    booking = create_booking(client, customer_headers, provider_profile_id)
    booking_id = booking["id"]
    return booking_id


def test_payment_checkout_retry_reuses_existing_checkout(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    quoted = client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 250.50, "quote_message": "Includes parts"},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    accepted = client.put(
        f"/customer/bookings/{booking_id}/accept-quote",
        headers=customer,
    )
    assert accepted.status_code == 200, accepted.text

    first = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    second = client.put(
        f"/customer/bookings/{booking_id}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["data"]["payment"]["id"] == first.json()["data"]["payment"]["id"]
    assert second.json()["data"]["token"] == first.json()["data"]["token"]


def test_payment_callback_is_idempotent(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "quote_message": "Labour only"},
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
    assert second.json()["data"]["booking"]["status"] == "accepted"


def test_payment_callback_rejects_amount_mismatch(client, marketplace, fake_iyzico):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_id = marketplace["provider_profile"]["id"]
    booking_id = _create_checkout(client, customer, provider_id)

    client.put(
        f"/provider/bookings/{booking_id}/quote",
        json={"quote_amount": 180, "quote_message": "Labour only"},
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
