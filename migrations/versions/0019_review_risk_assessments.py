"""Score reviews for fake-review risk and keep the admin moderation decision."""

import sqlalchemy as sa
from alembic import op


revision = "0019_review_risk_assessments"
down_revision = "0018_booking_onboarding_pause"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "review_risk_assessments" in sa.inspect(bind).get_table_names():
        return

    op.create_table(
        "review_risk_assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "review_id",
            sa.Integer(),
            sa.ForeignKey("reviews.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "provider_profile_id",
            sa.Integer(),
            sa.ForeignKey("provider_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("level", sa.String(16), nullable=False, server_default="low"),
        sa.Column("signals", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column(
            "reported_by_provider", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("provider_report_reason", sa.Text(), nullable=True),
        sa.Column("provider_reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "decided_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_review_risk_assessments_id", "review_risk_assessments", ["id"]
    )
    op.create_index(
        "ix_review_risk_assessments_review_id",
        "review_risk_assessments",
        ["review_id"],
    )
    op.create_index(
        "ix_review_risk_assessments_provider_profile_id",
        "review_risk_assessments",
        ["provider_profile_id"],
    )
    op.create_index(
        "ix_review_risk_assessments_level", "review_risk_assessments", ["level"]
    )
    op.create_index(
        "ix_review_risk_assessments_status", "review_risk_assessments", ["status"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "review_risk_assessments" not in sa.inspect(bind).get_table_names():
        return

    op.drop_index(
        "ix_review_risk_assessments_status", table_name="review_risk_assessments"
    )
    op.drop_index(
        "ix_review_risk_assessments_level", table_name="review_risk_assessments"
    )
    op.drop_index(
        "ix_review_risk_assessments_provider_profile_id",
        table_name="review_risk_assessments",
    )
    op.drop_index(
        "ix_review_risk_assessments_review_id", table_name="review_risk_assessments"
    )
    op.drop_index(
        "ix_review_risk_assessments_id", table_name="review_risk_assessments"
    )
    op.drop_table("review_risk_assessments")
