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
