"""Add the final iyzico authorization, marketplace, and refund schema."""

import sqlalchemy as sa
from alembic import op


revision = "0010_payment_backend_final"
down_revision = "0012_marketplace_commission"
branch_labels = None
depends_on = None


def _columns(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_columns(table_name: str, columns: tuple[sa.Column, ...]) -> None:
    inspector = sa.inspect(op.get_bind())
    missing = [column for column in columns if column.name not in _columns(inspector, table_name)]
    if missing:
        with op.batch_alter_table(table_name) as batch:
            for column in missing:
                batch.add_column(column)


def upgrade() -> None:
    _add_columns(
        "payments",
        (
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
            sa.Column("idempotency_key", sa.String(128), nullable=True),
            sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("checkout_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("capture_failed_at", sa.DateTime(timezone=True), nullable=True),
        ),
    )
    inspector = sa.inspect(op.get_bind())
    payment_indexes = {index["name"] for index in inspector.get_indexes("payments")}
    for name, column in (
        ("ix_payments_conversation_id", "conversation_id"),
        ("ix_payments_basket_id", "basket_id"),
        ("ix_payments_iyzico_token", "iyzico_token"),
        ("ix_payments_iyzico_payment_id", "iyzico_payment_id"),
        ("ix_payments_payment_transaction_id", "payment_transaction_id"),
        ("ix_payments_idempotency_key", "idempotency_key"),
    ):
        if name not in payment_indexes:
            op.create_index(name, "payments", [column], unique=False)

    inspector = sa.inspect(op.get_bind())
    payment_uniques = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("payments")
        if constraint["name"]
    }
    for name, columns in (
        ("uq_payments_conversation_id", ["conversation_id"]),
        ("uq_payments_iyzico_token", ["iyzico_token"]),
        ("uq_payments_customer_idempotency_key", ["customer_id", "idempotency_key"]),
    ):
        if name not in payment_uniques:
            with op.batch_alter_table("payments") as batch:
                batch.create_unique_constraint(name, columns)

    _add_columns(
        "bookings",
        (
            sa.Column("onboarding_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("onboarding_pause_reason", sa.String(64), nullable=True),
            sa.Column("onboarding_paused_at", sa.DateTime(timezone=True), nullable=True),
        ),
    )
    _add_columns(
        "refund_requests",
        (
            sa.Column("refund_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("external_refund_id", sa.String(128), nullable=True),
            sa.Column("failure_code", sa.String(64), nullable=True),
            sa.Column("failure_message", sa.Text(), nullable=True),
        ),
    )
    op.execute(
        sa.text(
            "UPDATE refund_requests SET refund_amount = "
            "(SELECT amount FROM payments WHERE payments.id = refund_requests.payment_id) "
            "WHERE refund_amount IS NULL"
        )
    )
    with op.batch_alter_table("refund_requests") as batch:
        batch.alter_column("refund_amount", existing_type=sa.Numeric(12, 2), nullable=False)
    inspector = sa.inspect(op.get_bind())
    refund_uniques = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("refund_requests")
        if constraint["name"]
    }
    if "uq_refund_requests_payment" not in refund_uniques:
        with op.batch_alter_table("refund_requests") as batch:
            batch.create_unique_constraint("uq_refund_requests_payment", ["payment_id"])

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("provider_submerchants"):
        op.create_table(
            "provider_submerchants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("provider_profile_id", sa.Integer(), sa.ForeignKey("provider_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("submerchant_type", sa.String(32), nullable=False),
            sa.Column("submerchant_external_id", sa.String(128), nullable=False),
            sa.Column("submerchant_key", sa.String(255), nullable=True),
            sa.Column("name", sa.String(255), nullable=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("gsm_number", sa.String(64), nullable=False),
            sa.Column("address", sa.String(512), nullable=False),
            sa.Column("iban", sa.String(64), nullable=True),
            sa.Column("contact_name", sa.String(128), nullable=True),
            sa.Column("contact_surname", sa.String(128), nullable=True),
            sa.Column("identity_number", sa.String(64), nullable=True),
            sa.Column("tax_office", sa.String(128), nullable=True),
            sa.Column("tax_number", sa.String(64), nullable=True),
            sa.Column("legal_company_title", sa.String(255), nullable=True),
            sa.Column("currency", sa.String(8), nullable=False, server_default="TRY"),
            sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
            sa.Column("iyzico_error_code", sa.String(64), nullable=True),
            sa.Column("iyzico_error_message", sa.Text(), nullable=True),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("provider_profile_id", name="uq_provider_submerchant_provider_profile"),
            sa.UniqueConstraint("submerchant_external_id", name="uq_provider_submerchant_external_id"),
        )
        op.create_index("ix_provider_submerchants_id", "provider_submerchants", ["id"])
        op.create_index("ix_provider_submerchants_provider_profile_id", "provider_submerchants", ["provider_profile_id"])

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("payment_settlements"):
        op.create_table(
            "payment_settlements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("provider_profile_id", sa.Integer(), sa.ForeignKey("provider_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("platform_commission_rate", sa.Numeric(6, 5), nullable=False),
            sa.Column("platform_commission_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("provider_share_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("payment_transaction_id", sa.String(128), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
            sa.Column("approve_requested_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("failure_code", sa.String(64), nullable=True),
            sa.Column("failure_message", sa.Text(), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("iyzico_commission_rate_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("iyzico_commission_fee", sa.Numeric(12, 2), nullable=True),
            sa.Column("blockage_rate", sa.Numeric(12, 8), nullable=True),
            sa.Column("blockage_resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("provider_payout_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("merchant_payout_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("provider_recovery_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("recovery_status", sa.String(32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("payment_id", name="uq_payment_settlement_payment"),
        )
        for name, column in (
            ("ix_payment_settlements_id", "id"),
            ("ix_payment_settlements_payment_id", "payment_id"),
            ("ix_payment_settlements_booking_id", "booking_id"),
            ("ix_payment_settlements_provider_profile_id", "provider_profile_id"),
        ):
            op.create_index(name, "payment_settlements", [column])

    # Databases created by the previous payment branch already contain the
    # Marketplace tables. Add only the fields introduced by this final branch.
    _add_columns(
        "payment_settlements",
        (
            sa.Column("provider_recovery_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("recovery_status", sa.String(32), nullable=True),
        ),
    )
    inspector = sa.inspect(op.get_bind())
    settlement_indexes = {
        index["name"] for index in inspector.get_indexes("payment_settlements")
    }
    if "ix_payment_settlements_payment_transaction_id" not in settlement_indexes:
        op.create_index(
            "ix_payment_settlements_payment_transaction_id",
            "payment_settlements",
            ["payment_transaction_id"],
            unique=False,
        )

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("booking_quote_revisions"):
        op.create_table(
            "booking_quote_revisions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("revision_number", sa.Integer(), nullable=False),
            sa.Column("quote_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("quote_message", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("customer_confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("used_for_payment_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("booking_id", "revision_number", name="uq_booking_quote_revision_number"),
        )
        op.create_index("ix_booking_quote_revisions_id", "booking_quote_revisions", ["id"])
        op.create_index("ix_booking_quote_revisions_booking_id", "booking_quote_revisions", ["booking_id"])
        op.create_index("ix_booking_quote_revisions_created_by_user_id", "booking_quote_revisions", ["created_by_user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("booking_quote_revisions", "payment_settlements", "provider_submerchants"):
        if inspector.has_table(table):
            op.drop_table(table)
