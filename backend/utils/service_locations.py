from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from backend import models
from backend.location_data import iter_location_seeds

VALID_LOCATION_LEVELS = {"province", "city", "district"}


def seed_service_locations(db: Session):
    existing = {
        location.code: location
        for location in db.query(models.ServiceLocation).all()
    }
    seeded = {}
    for item in iter_location_seeds():
        location = existing.get(item.code)
        if location is None:
            location = models.ServiceLocation(
                code=item.code,
                name=item.name,
                level=item.level,
                parent_id=seeded[item.parent_code].id if item.parent_code else None,
            )
            db.add(location)
            db.flush()
        else:
            location.name = item.name
            location.level = item.level
            location.parent_id = seeded[item.parent_code].id if item.parent_code else None
        seeded[item.code] = location
    return seeded


def get_location(db: Session, location_id: int):
    location = (
        db.query(models.ServiceLocation)
        .filter(models.ServiceLocation.id == location_id)
        .first()
    )
    if not location:
        raise HTTPException(status_code=404, detail="Service location not found")
    if location.level not in VALID_LOCATION_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid service location level")
    return location


def get_location_chain(db: Session, location: models.ServiceLocation):
    chain = []
    current = location
    while current is not None:
        chain.append(current)
        if current.parent_id is None:
            break
        current = get_location(db, current.parent_id)
    return list(reversed(chain))


def get_province_for_location(db: Session, location: models.ServiceLocation):
    return get_location_chain(db, location)[0]


def location_scope_ids(db: Session, location_id: int):
    selected = get_location(db, location_id)
    locations = db.query(models.ServiceLocation).all()
    children_by_parent = defaultdict(list)
    for location in locations:
        if location.parent_id is not None:
            children_by_parent[location.parent_id].append(location.id)

    scope = {selected.id}
    frontier = [selected.id]
    while frontier:
        parent_id = frontier.pop()
        children = children_by_parent[parent_id]
        scope.update(children)
        frontier.extend(children)
    return scope


def validate_profile_location(
    db: Session,
    location_id: int | None,
):
    if location_id is None:
        return None
    location = get_location(db, location_id)
    if location.level != "district":
        raise HTTPException(
            status_code=400,
            detail="Provider and customer service location must be a district",
        )
    return location


def apply_profile_location(profile, db: Session, location_id: int | None):
    location = validate_profile_location(db, location_id)
    if location is None:
        return None
    profile.service_location_id = location.id
    profile.service_province = get_province_for_location(db, location).name
    return location


def filter_provider_query_by_location(
    query: Query,
    db: Session,
    *,
    location_id: int | None = None,
    province_name: str | None = None,
):
    if location_id is not None:
        return query.filter(
            models.ProviderProfile.service_location_id.in_(
                location_scope_ids(db, location_id)
            )
        )

    if province_name:
        province = (
            db.query(models.ServiceLocation)
            .filter(
                models.ServiceLocation.level == "province",
                models.ServiceLocation.name == province_name,
            )
            .first()
        )
        if province:
            scoped_ids = location_scope_ids(db, province.id)
            return query.filter(
                or_(
                    models.ProviderProfile.service_location_id.in_(scoped_ids),
                    (
                        models.ProviderProfile.service_location_id.is_(None)
                        & models.ProviderProfile.service_province.contains(province_name)
                    ),
                )
            )
        return query.filter(models.ProviderProfile.service_province.contains(province_name))

    return query


def profile_matches_location(
    profile,
    db: Session,
    *,
    location_id: int | None = None,
    province_name: str | None = None,
):
    if location_id is not None:
        return profile.service_location_id in location_scope_ids(db, location_id)
    if province_name:
        return province_name.lower() in profile.service_province.lower()
    return True


def format_location_response(location):
    return {
        "id": location.id,
        "parent_id": location.parent_id,
        "code": location.code,
        "name": location.name,
        "level": location.level,
    }
