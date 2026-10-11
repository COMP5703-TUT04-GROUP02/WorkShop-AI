"""Install the fixed v1 workshop demonstration dataset once.

The snapshot is self-contained: never import application models, seed helpers,
clocks or password configuration into this migration. IDs are allocated by the
database and logical references are resolved inside the current transaction.
"""

import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import sqlalchemy as sa
from alembic import context, op


revision = "0018_workshop_samples"
down_revision = "0017_reference_price_range"
branch_labels = None
depends_on = None

SNAPSHOT = Path(__file__).resolve().parents[1] / "data" / "0018_workshop_samples.json"


def upgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError("0018_workshop_samples requires an online database connection")

    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if snapshot["revision"] != revision:
        raise RuntimeError("Unexpected sample snapshot version")
    bind = op.get_bind()
    metadata = sa.MetaData()
    tables = {
        group["table"]: sa.Table(group["table"], metadata, autoload_with=bind)
        for group in snapshot["tables"]
    }

    # A previous seed may have used these emails. Never adopt, reset passwords,
    # or silently overwrite an existing user's records, even for a demo account.
    user_group = next(g for g in snapshot["tables"] if g["table"] == "users")
    emails = [row["values"]["email"] for row in user_group["rows"]]
    users = tables["users"]
    conflicts = list(bind.execute(sa.select(users.c.email).where(users.c.email.in_(emails))).scalars())
    if conflicts:
        raise RuntimeError(
            "Sample migration found existing demo accounts; no data was overwritten. "
            "Use a fresh development database or reconcile the conflicting accounts "
            "before retrying: " + ", ".join(sorted(conflicts))
        )

    references = {}
    for group in snapshot["tables"]:
        table = tables[group["table"]]
        for row in group["rows"]:
            key = row["key"]
            if key in references:
                raise RuntimeError(f"Duplicate sample reference: {key}")
            values = {}
            for name, value in row["values"].items():
                column = table.c[name]
                if isinstance(value, dict):
                    if set(value) != {"ref"}:
                        raise RuntimeError(f"Invalid reference in {key}.{name}")
                    value = references[value["ref"]]
                elif value is not None:
                    if isinstance(column.type, sa.DateTime):
                        value = datetime.fromisoformat(value)
                    elif isinstance(column.type, sa.Date):
                        value = date.fromisoformat(value)
                    elif isinstance(column.type, sa.Numeric):
                        value = Decimal(str(value))
                values[name] = value

            # Existing reference locations can be shared with real accounts.
            # Reuse matching codes without editing their names or hierarchy.
            if table.name == "service_locations":
                existing = bind.execute(
                    sa.select(table).where(table.c.code == values["code"])
                ).mappings().first()
                if existing is not None:
                    if any(existing[name] != value for name, value in values.items()):
                        raise RuntimeError(f"Conflicting existing service location: {values['code']}")
                    references[key] = existing["id"]
                    continue

            result = bind.execute(table.insert().values(**values))
            references[key] = result.inserted_primary_key[0]


def downgrade() -> None:
    # Once used, these accounts may own new bookings, uploads and payments.
    # Cascading deletion would destroy data created after the migration.
    raise RuntimeError(
        "0018_workshop_samples is a forward-only data migration. "
        "Use a new disposable database to reset samples; downgrade will not delete user data."
    )
