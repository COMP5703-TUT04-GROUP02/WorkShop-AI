"""Add language-neutral templates for new in-app notifications."""

import sqlalchemy as sa
from alembic import op


revision = "0019_notification_templates"
down_revision = "0018_workshop_samples"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 creates tables from the current model on a fresh database. Existing
    # installations at 0018 still need these columns added.
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("notifications")}
    with op.batch_alter_table("notifications") as batch:
        if "template_key" not in existing:
            batch.add_column(sa.Column("template_key", sa.String(length=128), nullable=True))
        if "template_params" not in existing:
            batch.add_column(sa.Column("template_params", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("template_params")
        batch.drop_column("template_key")
