import type {
  ServiceAreaSelection,
  ServiceLocation,
} from "../../types/location";

export type LocationCascadeState = {
  province: ServiceLocation | null;
  city: ServiceLocation | null;
  district: ServiceLocation | null;
};

export const EMPTY_LOCATION_CASCADE: LocationCascadeState = {
  province: null,
  city: null,
  district: null,
};

export function filterServiceLocations(
  locations: ServiceLocation[],
  keyword: string,
) {
  const query = normalizeLocationSearchText(keyword.trim());
  if (!query) {
    return locations;
  }

  return locations.filter((location) =>
    normalizeLocationSearchText(`${location.name} ${location.code}`).includes(
      query,
    ),
  );
}

function normalizeLocationSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "i")
    .toLowerCase();
}

export function createLatestRequestGate() {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    invalidate() {
      latestRequestId += 1;
    },
    isLatest(requestId: number) {
      return requestId === latestRequestId;
    },
  };
}

export function chooseProvince(
  _current: LocationCascadeState,
  province: ServiceLocation,
): LocationCascadeState {
  return { province, city: null, district: null };
}

export function chooseCity(
  current: LocationCascadeState,
  city: ServiceLocation,
): LocationCascadeState {
  return { province: current.province, city, district: null };
}

export function chooseDistrict(
  current: LocationCascadeState,
  district: ServiceLocation,
): LocationCascadeState {
  return { ...current, district };
}

export function getCompletedLocation(
  current: LocationCascadeState,
): ServiceAreaSelection | null {
  if (!current.province || !current.city || !current.district) {
    return null;
  }

  return {
    serviceLocationId: current.district.id,
    serviceProvince: current.province.name,
    label: [current.province.name, current.city.name, current.district.name].join(
      " / ",
    ),
  };
}
