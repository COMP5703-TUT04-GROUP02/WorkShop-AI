from decimal import Decimal

AI_RECOMMENDATION_PROVIDER_TAGS = [
    "cleaning",
    "childcare",
    "elderly_care",
    "electrician",
    "plumbing",
    "painter",
    "locksmith",
    "technician",
    "moving",
]

ALLOWED_PROVIDER_TAGS = [
    *AI_RECOMMENDATION_PROVIDER_TAGS,
    "other",
]

DEMO_PASSWORD = "Demo1234"

# A booking worth less than this cannot pay for an hour of any provider on the
# platform, so a review attached to one is almost certainly a review farmed
# through a token-priced order. Admins can override it per sweep.
LOW_VALUE_REVIEW_THRESHOLD = Decimal("100")
