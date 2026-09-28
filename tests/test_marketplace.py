from backend import models
from backend.database import SessionLocal
from backend.schemas import SubmerchantType
from backend.utils.marketplace_seed import build_demo_submerchant_data
from tests.conftest import create_booking


def _remove_provider_submerchant(provider_profile_id: int) -> None:
    db = SessionLocal()
    try:
        db.query(models.ProviderSubmerchant).filter(
            models.ProviderSubmerchant.provider_profile_id == provider_profile_id
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_demo_submerchant_fixtures_are_official_and_evenly_shuffled():
    values = []
    for index in range(1, 31):
        if index in {6, 7, 8, 9}:
            continue
        user = models.User(email=f"demo_provider_{index}@workshop.ai")
        provider = models.ProviderProfile()
        values.append(build_demo_submerchant_data(provider, user))

    counts = {}
    for value in values:
        key = value["submerchant_type"]
        counts[key] = counts.get(key, 0) + 1

    assert counts == {
        SubmerchantType.personal: 9,
        SubmerchantType.private_company: 9,
        SubmerchantType.limited_or_joint_stock_company: 8,
    }
    assert all(
        value["iban"] == "TR180006200119000006672315" for value in values
    )
    assert all(
        value.get("identity_number") in {None, "31300864726"} for value in values
    )


def test_provider_can_manage_submerchant_without_exposing_secret_key(
    client, marketplace
):
    provider = marketplace["provider"]["headers"]
    _remove_provider_submerchant(marketplace["provider_profile"]["id"])
    payload = {
        "submerchant_type": "PERSONAL",
        "name": "Can Provider",
        "email": "provider@example.com",
        "gsm_number": "+905551110000",
        "address": "Karakoy, Istanbul",
        "iban": "TR180006200119000006672315",
        "contact_name": "Can",
        "contact_surname": "Provider",
        "identity_number": "10000000001",
    }

    response = client.put("/provider/submerchant", json=payload, headers=provider)

    assert response.status_code == 200, response.text
    submerchant = response.json()["data"]["submerchant"]
    assert submerchant["status"] == "active"
    assert "submerchant_key" not in submerchant

    fetched = client.get("/provider/submerchant", headers=provider)
    assert fetched.status_code == 200, fetched.text
    assert "submerchant_key" not in fetched.json()["data"]["submerchant"]


def test_draft_provider_can_quote_and_customer_can_accept_booking(
    client, marketplace
):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_profile_id = marketplace["provider_profile"]["id"]
    _remove_provider_submerchant(provider_profile_id)

    booking = create_booking(client, customer, provider_profile_id)
    response = client.put(
        f"/provider/bookings/{booking['id']}/quote",
        json={"quote_amount": 250, "quote_message": "Includes parts"},
        headers=provider,
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["booking"]["status"] == "quoted"

    accepted = client.put(
        f"/customer/bookings/{booking['id']}/accept-quote", headers=customer
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["booking"]["status"] == "awaiting_payment"

    db = SessionLocal()
    try:
        stored_booking = db.get(models.Booking, booking["id"])
        assert stored_booking.status == "awaiting_payment"
        assert stored_booking.onboarding_paused is False
        assert stored_booking.onboarding_pause_reason is None
    finally:
        db.close()

    payment = client.put(
        f"/customer/bookings/{booking['id']}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert payment.status_code == 409, payment.text
    assert payment.json()["error"]["detail"]["code"] == "SUBMERCHANT_REQUIRED"


def test_payment_records_commission_split_but_hides_it_from_customer(
    client, marketplace, fake_iyzico
):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_profile_id = marketplace["provider_profile"]["id"]
    booking = create_booking(client, customer, provider_profile_id)

    quoted = client.put(
        f"/provider/bookings/{booking['id']}/quote",
        json={"quote_amount": 180, "quote_message": "Labour only"},
        headers=provider,
    )
    assert quoted.status_code == 200, quoted.text
    accepted = client.put(
        f"/customer/bookings/{booking['id']}/accept-quote", headers=customer
    )
    assert accepted.status_code == 200, accepted.text

    checkout = client.put(
        f"/customer/bookings/{booking['id']}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    assert checkout.status_code == 200, checkout.text
    token = checkout.json()["data"]["token"]
    payload = fake_iyzico.sessions[token]
    assert payload["basketItems"][0]["subMerchantPrice"] == "162.00"

    callback = client.post("/payments/iyzico/callback", data={"token": token})
    assert callback.status_code == 200, callback.text
    assert callback.json()["data"]["payment"]["settlement"] is None

    customer_payments = client.get("/customer/payments", headers=customer)
    assert customer_payments.status_code == 200, customer_payments.text
    customer_payment = customer_payments.json()["data"]["items"][0]
    assert customer_payment["settlement"] is None

    provider_payments = client.get("/provider/payments", headers=provider)
    assert provider_payments.status_code == 200, provider_payments.text
    settlement = provider_payments.json()["data"]["items"][0]["settlement"]
    assert settlement["platform_commission_amount"] == 18.0
    assert settlement["provider_share_amount"] == 162.0
    assert settlement["status"] == "pending"


def test_paid_settlement_can_be_approved_after_completion(client, marketplace):
    customer = marketplace["customer"]["headers"]
    provider = marketplace["provider"]["headers"]
    provider_profile_id = marketplace["provider_profile"]["id"]
    booking = create_booking(client, customer, provider_profile_id)

    client.put(
        f"/provider/bookings/{booking['id']}/quote",
        json={"quote_amount": 180, "quote_message": "Labour only"},
        headers=provider,
    )
    client.put(f"/customer/bookings/{booking['id']}/accept-quote", headers=customer)
    checkout = client.put(
        f"/customer/bookings/{booking['id']}/pay",
        json={"payment_method": "iyzico_checkout"},
        headers=customer,
    )
    callback = client.post(
        "/payments/iyzico/callback",
        data={"token": checkout.json()["data"]["token"]},
    )
    assert callback.status_code == 200, callback.text
    payment_id = callback.json()["data"]["payment"]["id"]

    from backend.tasks.marketplace_tasks import _approve_payment_settlement

    result = _approve_payment_settlement(payment_id)
    assert result["status"] == "approved"

    db = SessionLocal()
    try:
        settlement = (
            db.query(models.PaymentSettlement)
            .filter(models.PaymentSettlement.payment_id == payment_id)
            .one()
        )
        assert settlement.status == "approved"
        assert settlement.approved_at is not None
    finally:
        db.close()
