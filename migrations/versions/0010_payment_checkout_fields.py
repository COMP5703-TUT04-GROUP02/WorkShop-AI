"""Add iyzico Checkout Form fields to payments."""

import sqlalchemy as sa
from alembic import op


revision = "0010_payment_checkout"
down_revision = "0009_provider_verification"
branch_labels = None
depends_on = None


PAYMENT_COLUMNS = (
    sa.Column("conversation_id", sa.String(128), nullable=True),
    sa.Column("basket_id", sa.String(128), nullable=True),
    sa.Column("iyzico_token", sa.String(255), nullable=True),
    sa.Column("checkout_url", sa.String(2048), nullable=True),
    sa.Column("iyzico_payment_id", sa.String(128), nullable=True),
    sa.Column("payment_transaction_id", sa.String(128), nullable=True),
    sa.Column("external_status", sa.String(64), nullable=True),
    sa.Column("failure_code", sa.String(64), nullable=True),
    sa.Column("failure_message", sa.Text(), nullable=True),
    sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
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
    for index_name, column_name in (
        ("ix_payments_conversation_id", "conversation_id"),
        ("ix_payments_basket_id", "basket_id"),
        ("ix_payments_iyzico_token", "iyzico_token"),
        ("ix_payments_iyzico_payment_id", "iyzico_payment_id"),
        ("ix_payments_payment_transaction_id", "payment_transaction_id"),
    ):
        if index_name not in indexes:
            op.create_index(index_name, "payments", [column_name], unique=False)

    inspector = sa.inspect(bind)
    existing_unique = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("payments")
        if constraint["name"]
    }
    for constraint_name, column_name in (
        ("uq_payments_conversation_id", "conversation_id"),
        ("uq_payments_iyzico_token", "iyzico_token"),
    ):
        if constraint_name not in existing_unique:
            with op.batch_alter_table("payments") as batch_op:
                batch_op.create_unique_constraint(constraint_name, [column_name])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_indexes = {
        index["name"] for index in inspector.get_indexes("payments")
    }
    for index_name in (
        "ix_payments_payment_transaction_id",
        "ix_payments_iyzico_payment_id",
        "ix_payments_iyzico_token",
        "ix_payments_basket_id",
        "ix_payments_conversation_id",
    ):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name="payments")

    inspector = sa.inspect(bind)
    existing_unique = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("payments")
        if constraint["name"]
    }
    for constraint_name in ("uq_payments_iyzico_token", "uq_payments_conversation_id"):
        if constraint_name in existing_unique:
            with op.batch_alter_table("payments") as batch_op:
                batch_op.drop_constraint(constraint_name, type_="unique")

    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("payments")
    }
    for column in reversed(PAYMENT_COLUMNS):
        if column.name in existing_columns:
            with op.batch_alter_table("payments") as batch_op:
                batch_op.drop_column(column.name)
