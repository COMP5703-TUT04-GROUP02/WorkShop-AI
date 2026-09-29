"""Keep the legacy payment revision addressable during the final migration.

The previous payment branch left existing local databases at this revision.
The final payment migration is idempotent and performs the actual schema
upgrade after this compatibility anchor, so fresh databases and legacy local
databases converge on the same final schema.
"""


revision = "0012_marketplace_commission"
down_revision = "0009_provider_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Keep the legacy revision available; the final migration owns the schema."""


def downgrade() -> None:
    """The compatibility anchor has no standalone schema changes."""
