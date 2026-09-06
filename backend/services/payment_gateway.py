from decimal import Decimal

from backend.core.clock import utc_now


class MockPaymentGateway:
    def charge(self, amount: Decimal, currency: str = "TRY") -> dict:
        return {
            "status": "succeeded",
            "currency": currency,
            "amount": amount,
            "external_payment_id": f"mock-{int(utc_now().timestamp() * 1000)}",
            "paid_at": utc_now(),
        }


payment_gateway = MockPaymentGateway()
