"""Create one fresh high-risk review case so the evidence run has something pending."""
import json
import sys
import urllib.parse
import urllib.request
from datetime import timedelta
from decimal import Decimal

sys.path.insert(0, "/Users/ooominwooo/Documents/GitHub/WorkShop-AI")
from backend import models
from backend.auth import create_password_identity
from backend.core.clock import utc_now
from backend.database import SessionLocal

API = "http://127.0.0.1:8000"
STAMP = str(int(utc_now().timestamp()))[-6:]
db = SessionLocal()

user = models.User(
    name=f"Copy Reviewer {STAMP}",
    first_name="Copy",
    last_name=f"Reviewer{STAMP}",
    email=f"copy_reviewer_{STAMP}@workshop.ai",
    role="customer",
    is_active=True,
    is_banned=False,
    created_at=utc_now(),
)
db.add(user)
db.flush()
create_password_identity(user, "Demo1234", db, verified=True)
db.commit()

now = utc_now()
booking = models.Booking(
    customer_id=user.id,
    provider_profile_id=1,
    title="Deep clean",
    service_description="Two bedroom deep clean",
    service_address="Besiktas, Istanbul",
    service_latitude=41.0422,
    service_longitude=29.0061,
    booking_at=now - timedelta(days=1),
    scheduled_start_time=now - timedelta(hours=2),
    scheduled_end_time=now,
    completed_at=now,
    total_amount=Decimal("55.00"),
    status="completed",
)
db.add(booking)
db.commit()
db.refresh(booking)
email = user.email
booking_id = booking.id
db.close()

form = urllib.parse.urlencode({"username": email, "password": "Demo1234"}).encode()
with urllib.request.urlopen(urllib.request.Request(f"{API}/login", data=form)) as response:
    token = json.load(response)["data"]["access_token"]

payload = json.dumps(
    {"rating": 5, "comment": "Explained everything clearly with no surprise charges."}
).encode()
request = urllib.request.Request(
    f"{API}/bookings/{booking_id}/review",
    data=payload,
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(request) as response:
    review = json.load(response)["data"]["review"]

print(f"seeded review #{review['id']} on booking {booking_id} as {email}")
