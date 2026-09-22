import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { ServiceAreaSelection, ServiceLocation } from "../types/location";

type ServiceLocationList = {
  items: ServiceLocation[];
};

export async function getServiceLocations(parentId?: number) {
  const response = await apiClient.get<ApiResponse<ServiceLocationList>>(
    "/locations",
    {
      params: {
        parent_id: parentId,
      },
    },
  );

  return response.data.data?.items ?? [];
}

export async function getServiceLocation(locationId: number) {
  const response = await apiClient.get<ApiResponse<ServiceLocation>>(
    `/locations/${locationId}`,
  );

  return response.data.data;
}

export async function getServiceLocationPath(locationId: number) {
  const district = await getServiceLocation(locationId);
  if (!district || district.level !== "district" || !district.parent_id) {
    throw new Error("The saved service area is not a district.");
  }

  const city = await getServiceLocation(district.parent_id);
  if (!city || city.level !== "city" || !city.parent_id) {
    throw new Error("The saved district has no city.");
  }

  const province = await getServiceLocation(city.parent_id);
  if (!province || province.level !== "province") {
    throw new Error("The saved city has no province.");
  }

  return { province, city, district };
}

export async function getServiceAreaSelection(
  locationId: number,
): Promise<ServiceAreaSelection> {
  const path = await getServiceLocationPath(locationId);

  return {
    serviceLocationId: path.district.id,
    serviceProvince: path.province.name,
    label: [path.province.name, path.city.name, path.district.name].join(" / "),
  };
}
