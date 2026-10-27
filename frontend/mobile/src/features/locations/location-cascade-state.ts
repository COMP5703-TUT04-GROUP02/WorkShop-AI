import type {
  ServiceAreaSelection,
  ServiceLocation,
} from "../../types/location";
import { currentLocale } from "../../i18n/language";

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

export const CUSTOMER_DEFAULT_LOCATION_CODES = {
  province: "tr-istanbul",
  city: "tr-istanbul-city",
  district: "tr-istanbul-city-kadikoy",
} as const;

export function findLocationByCode(
  locations: ServiceLocation[],
  code: string,
): ServiceLocation | null {
  return locations.find((location) => location.code === code) ?? null;
}

export function findLocationByName(
  locations: ServiceLocation[],
  name: string,
): ServiceLocation | null {
  const normalizedName = name.trim().toLocaleLowerCase(currentLocale());
  return locations.find(
    (location) => location.name.toLocaleLowerCase(currentLocale()) === normalizedName,
  ) ?? null;
}

export function sortServiceLocations(
  locations: ServiceLocation[],
  preferredCode?: string,
): ServiceLocation[] {
  return [...locations].sort((left, right) => {
    if (left.code === preferredCode) return -1;
    if (right.code === preferredCode) return 1;
    return left.name.localeCompare(right.name, currentLocale(), { sensitivity: "base" });
  });
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
  allowAnyLevel = false,
): ServiceAreaSelection | null {
  if (!current.province || (!allowAnyLevel && (!current.city || !current.district))) {
    return null;
  }

  const selected = current.district ?? current.city ?? current.province;
  const path = [current.province, current.city, current.district].filter(
    (item): item is ServiceLocation => Boolean(item),
  );

  return {
    serviceLocationId: selected.id,
    serviceProvince: current.province.name,
    label: path.map((item) => item.name).join(" / "),
  };
}
