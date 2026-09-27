"""Add payment initialization idempotency fields."""

import sqlalchemy as sa
from alembic import op


revision = "0011_payment_idempotency"
down_revision = "0010_payment_checkout"
branch_labels = None
depends_on = None


PAYMENT_COLUMNS = (
    sa.Column("idempotency_key", sa.String(128), nullable=True),
    sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("checkout_expires_at", sa.DateTime(timezone=True), nullable=True),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("payments")
    }

    missing_columns = [
        column for column in PAYMENT_COLUMNS if column.name not in existing_columns
    ]
    if missing_columns:
        with op.batch_alter_table("payments") as batch_op:
            for column in missing_columns:
                batch_op.add_column(column)

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("payments")}
    if "ix_payments_idempotency_key" not in indexes:
        op.create_index(
            "ix_payments_idempotency_key",
            "payments",
            ["idempotency_key"],
            unique=False,
        )

    inspector = sa.inspect(bind)
    constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("payments")
        if constraint["name"]
    }
    if "uq_payments_customer_idempotency_key" not in constraints:
        with op.batch_alter_table("payments") as batch_op:
            batch_op.create_unique_constraint(
                "uq_payments_customer_idempotency_key",
                ["customer_id", "idempotency_key"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("payments")
        if constraint["name"]
    }
    if "uq_payments_customer_idempotency_key" in constraints:
        with op.batch_alter_table("payments") as batch_op:
            batch_op.drop_constraint(
                "uq_payments_customer_idempotency_key",
                type_="unique",
            )

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("payments")}
    if "ix_payments_idempotency_key" in indexes:
        op.drop_index("ix_payments_idempotency_key", table_name="payments")

    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("payments")
    }
    for column in reversed(PAYMENT_COLUMNS):
        if column.name in existing_columns:
            with op.batch_alter_table("payments") as batch_op:
                batch_op.drop_column(column.name)
