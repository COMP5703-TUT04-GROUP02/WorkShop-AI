"""Remove the obsolete refund service-stage field."""

from alembic import op
import sqlalchemy as sa


revision = "0011_completed_refunds_only"
down_revision = "0010_payment_backend_final"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("refund_requests")}
    if "service_stage" in columns:
        with op.batch_alter_table("refund_requests") as batch:
            batch.drop_column("service_stage")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("refund_requests")}
    if "service_stage" not in columns:
        with op.batch_alter_table("refund_requests") as batch:
            batch.add_column(
                sa.Column(
                    "service_stage",
                    sa.String(32),
                    nullable=False,
                    server_default="service_completed",
                )
            )
