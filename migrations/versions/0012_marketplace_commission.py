"""Add Marketplace onboarding, payment settlement, and booking holds."""

import sqlalchemy as sa
from alembic import op


revision = "0012_marketplace_commission"
down_revision = "0011_payment_idempotency"
branch_labels = None
depends_on = None


BOOKING_COLUMNS = (
    sa.Column("onboarding_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("onboarding_pause_reason", sa.String(64), nullable=True),
    sa.Column("onboarding_paused_at", sa.DateTime(timezone=True), nullable=True),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("provider_submerchants"):
        op.create_table(
            "provider_submerchants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "provider_profile_id",
                sa.Integer(),
                sa.ForeignKey("provider_profiles.id", ondelete="CASCADE"),
                nullable=False,
            ),
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
            sa.UniqueConstraint(
                "provider_profile_id",
                name="uq_provider_submerchant_provider_profile",
            ),
            sa.UniqueConstraint(
                "submerchant_external_id",
                name="uq_provider_submerchant_external_id",
            ),
        )
        op.create_index(
            "ix_provider_submerchants_id",
            "provider_submerchants",
            ["id"],
            unique=False,
        )
        op.create_index(
            "ix_provider_submerchants_provider_profile_id",
            "provider_submerchants",
            ["provider_profile_id"],
            unique=False,
        )

    inspector = sa.inspect(bind)
    if not inspector.has_table("payment_settlements"):
        op.create_table(
            "payment_settlements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "payment_id",
                sa.Integer(),
                sa.ForeignKey("payments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "booking_id",
                sa.Integer(),
                sa.ForeignKey("bookings.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "provider_profile_id",
                sa.Integer(),
                sa.ForeignKey("provider_profiles.id", ondelete="CASCADE"),
                nullable=False,
            ),
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
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("payment_id", name="uq_payment_settlement_payment"),
        )
        op.create_index(
            "ix_payment_settlements_id",
            "payment_settlements",
            ["id"],
            unique=False,
        )
        op.create_index(
            "ix_payment_settlements_payment_id",
            "payment_settlements",
            ["payment_id"],
            unique=False,
        )
        op.create_index(
            "ix_payment_settlements_booking_id",
            "payment_settlements",
            ["booking_id"],
            unique=False,
        )
        op.create_index(
            "ix_payment_settlements_provider_profile_id",
            "payment_settlements",
            ["provider_profile_id"],
            unique=False,
        )

    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("bookings")}
    missing_columns = [
        column for column in BOOKING_COLUMNS if column.name not in existing_columns
    ]
    if missing_columns:
        with op.batch_alter_table("bookings") as batch_op:
            for column in missing_columns:
                batch_op.add_column(column)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("payment_settlements"):
        op.drop_table("payment_settlements")
    if inspector.has_table("provider_submerchants"):
        op.drop_table("provider_submerchants")

    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("bookings")}
    for column in reversed(BOOKING_COLUMNS):
        if column.name in existing_columns:
            with op.batch_alter_table("bookings") as batch_op:
                batch_op.drop_column(column.name)
