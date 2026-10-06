import importlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_reference_price_migration_adds_nullable_indexed_service_category():
    migration = importlib.import_module(
        "migrations.versions.0017_reference_price_range"
    )
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    sa.Table("bookings", metadata, sa.Column("id", sa.Integer, primary_key=True))
    metadata.create_all(engine)

    with engine.begin() as connection, Operations.context(
        MigrationContext.configure(connection)
    ):
        migration.upgrade()
        inspector = sa.inspect(connection)
        column = next(
            item
            for item in inspector.get_columns("bookings")
            if item["name"] == "service_category"
        )
        assert column["nullable"] is True
        assert {
            item["name"] for item in inspector.get_indexes("bookings")
        } == {"ix_bookings_service_category"}

        migration.downgrade()
        assert "service_category" not in {
            item["name"] for item in sa.inspect(connection).get_columns("bookings")
        }

    engine.dispose()
