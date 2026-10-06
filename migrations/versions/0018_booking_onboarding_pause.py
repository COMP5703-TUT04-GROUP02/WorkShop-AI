"""Restore the booking onboarding-pause columns the payment merge dropped.

The iyzico payment branch declared these on the model in its own
`0010_payment_backend_final` revision. That file collided with the
qualification-areas revision already on main and was lost in the merge, so the
columns exist in `models/booking.py` but not in the database. Any query that
loads a booking fails on PostgreSQL until they are back.
"""

import sqlalchemy as sa
from alembic import op


revision = "0018_booking_onboarding_pause"
down_revision = "0016_email_verification_codes"
branch_labels = None
depends_on = None


def _booking_columns(bind):
    return {column["name"] for column in sa.inspect(bind).get_columns("bookings")}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _booking_columns(bind)

    if "onboarding_paused" not in columns:
        op.add_column(
            "bookings",
            sa.Column(
                "onboarding_paused",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if "onboarding_pause_reason" not in columns:
        op.add_column(
            "bookings",
            sa.Column("onboarding_pause_reason", sa.String(64), nullable=True),
        )
    if "onboarding_paused_at" not in columns:
        op.add_column(
            "bookings",
            sa.Column(
                "onboarding_paused_at", sa.DateTime(timezone=True), nullable=True
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = _booking_columns(bind)

    for name in (
        "onboarding_paused_at",
        "onboarding_pause_reason",
        "onboarding_paused",
    ):
        if name in columns:
            op.drop_column("bookings", name)
