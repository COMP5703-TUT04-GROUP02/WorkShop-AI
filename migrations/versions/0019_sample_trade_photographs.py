"""Move the demonstration portfolios onto the trade photographs.

Every category used to be one placeholder, `cleaning.png` and its nine
siblings. Each category now has five or six photographs of the actual trade,
and the ten placeholders are gone from the repository.

0018 installs the sample data once per database, so a database created before
that change still points at the ten deleted files and shows nothing where a
photograph belongs. This migration moves those rows onto the same snapshot a
fresh database would receive, so the two end up identical.

It is deliberately narrow. A row is only rewritten when it still points at one
of the retired demo paths, which nothing but the sample data has ever used, so
a portfolio someone uploaded themselves cannot be touched. Running it twice
changes nothing the second time, and a database that never received the sample
data is left alone.
"""

import json
from pathlib import Path

import sqlalchemy as sa
from alembic import context, op


revision = "0019_sample_trade_photographs"
down_revision = "0018_workshop_samples"
branch_labels = None
depends_on = None

SNAPSHOT = Path(__file__).resolve().parents[1] / "data" / "0018_workshop_samples.json"

# The two directories the sample data owns. Only values under these prefixes
# are ever rewritten.
CATEGORY_PREFIX = "/sample-media/service_categories/"
AVATAR_PREFIX = "/sample-media/avatars/"


def _path(url):
    """The URL without its cache-busting query, or None."""
    return url.split("?", 1)[0] if url else None


def upgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "0019_sample_trade_photographs reads existing rows and requires an "
            "online database connection"
        )

    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    groups = {group["table"]: group["rows"] for group in snapshot["tables"]}

    bind = op.get_bind()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, autoload_with=bind)
    profiles = sa.Table("provider_profiles", metadata, autoload_with=bind)
    portfolios = sa.Table("provider_portfolios", metadata, autoload_with=bind)
    media = sa.Table("provider_portfolio_media", metadata, autoload_with=bind)

    # --- the demo accounts, as this database actually stored them -----------
    wanted = {row["key"]: row["values"]["email"] for row in groups["users"]}
    found = {
        email: user_id
        for email, user_id in bind.execute(
            sa.select(users.c.email, users.c.id).where(
                users.c.email.in_(list(wanted.values()))
            )
        ).all()
    }
    if not found:
        # No sample data here. Nothing to move.
        return

    user_id_by_key = {
        key: found[email] for key, email in wanted.items() if email in found
    }
    profile_id_by_user = dict(
        bind.execute(
            sa.select(profiles.c.user_id, profiles.c.id).where(
                profiles.c.user_id.in_(list(user_id_by_key.values()))
            )
        ).all()
    )
    # provider_profile:N belongs to a user the snapshot names; follow that
    # reference rather than guessing one key's spelling from another's.
    profile_id_by_key = {}
    for row in groups["provider_profiles"]:
        user_id = user_id_by_key.get(row["values"]["user_id"]["ref"])
        if user_id in profile_id_by_user:
            profile_id_by_key[row["key"]] = profile_id_by_user[user_id]

    # --- the avatars, which the demo customers did not have before ---------
    # Give one to an account that has none, and move one the sample itself
    # set. A face somebody uploaded onto a demo account is theirs: leave it.
    avatars = 0
    for row in groups["users"]:
        user_id = user_id_by_key.get(row["key"])
        wanted_url = row["values"].get("avatar_url")
        if user_id is None or not wanted_url:
            continue

        current = bind.execute(
            sa.select(users.c.avatar_url).where(users.c.id == user_id)
        ).scalar_one_or_none()
        if current == wanted_url:
            continue
        if current is not None and not (
            current.startswith(AVATAR_PREFIX) and _path(current) == _path(wanted_url)
        ):
            continue

        bind.execute(
            users.update().where(users.c.id == user_id).values(avatar_url=wanted_url)
        )
        avatars += 1

    # --- the portfolios: a placeholder becomes a photograph of the trade ----
    # A portfolio is found by whose it is and what it is called, because that
    # is what the snapshot fixes; the database's own ids are its business.
    rewritten = 0
    portfolio_ids = {}
    for row in groups["provider_portfolios"]:
        values = row["values"]
        profile_id = profile_id_by_key.get(values["provider_profile_id"]["ref"])
        if profile_id is None:
            continue

        existing = bind.execute(
            sa.select(portfolios.c.id, portfolios.c.image_url).where(
                sa.and_(
                    portfolios.c.provider_profile_id == profile_id,
                    portfolios.c.title == values["title"],
                )
            )
        ).mappings().first()
        if existing is None:
            continue

        portfolio_ids[row["key"]] = existing["id"]
        current = existing["image_url"]
        if not current or not current.startswith(CATEGORY_PREFIX):
            continue
        if current == values["image_url"]:
            continue

        bind.execute(
            portfolios.update()
            .where(portfolios.c.id == existing["id"])
            .values(
                image_url=values["image_url"],
                original_file_name=values["original_file_name"],
                content_type=values["content_type"],
            )
        )
        rewritten += 1

    # --- and the media row that carries the same file ----------------------
    media_rewritten = 0
    for row in groups["provider_portfolio_media"]:
        values = row["values"]
        portfolio_id = portfolio_ids.get(values["portfolio_id"]["ref"])
        if portfolio_id is None:
            continue

        existing = bind.execute(
            sa.select(media.c.id, media.c.file_url).where(
                sa.and_(
                    media.c.portfolio_id == portfolio_id,
                    media.c.sort_order == values["sort_order"],
                )
            )
        ).mappings().first()
        if existing is None:
            continue

        current = existing["file_url"]
        if not current or not current.startswith(CATEGORY_PREFIX):
            continue
        if current == values["file_url"]:
            continue

        bind.execute(
            media.update()
            .where(media.c.id == existing["id"])
            .values(
                file_url=values["file_url"],
                original_file_name=values["original_file_name"],
                content_type=values["content_type"],
            )
        )
        media_rewritten += 1

    print(
        f"0019: {rewritten} portfolios, {media_rewritten} media rows and "
        f"{avatars} avatars moved onto the current sample photographs"
    )


def downgrade() -> None:
    # The files this would point back at were deleted with the placeholders,
    # so restoring the old URLs would only break the images again. The schema
    # is unchanged either way, so there is nothing to undo.
    pass
