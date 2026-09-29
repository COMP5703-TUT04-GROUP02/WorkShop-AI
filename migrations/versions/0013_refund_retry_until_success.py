"""Allow retrying unsuccessful refund requests."""

from alembic import op
import sqlalchemy as sa


revision = "0013_refund_retry_until_success"
down_revision = "0011_completed_refunds_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("refund_requests")
        if constraint["name"]
    }
    if "uq_refund_requests_payment" in unique_constraints:
        with op.batch_alter_table("refund_requests") as batch:
            batch.drop_constraint("uq_refund_requests_payment", type_="unique")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("refund_requests")
        if constraint["name"]
    }
    if "uq_refund_requests_payment" not in unique_constraints:
        with op.batch_alter_table("refund_requests") as batch:
            batch.create_unique_constraint(
                "uq_refund_requests_payment",
                ["payment_id"],
            )
