export type SelectedLocation = {
  label: string;
  latitude: number | null;
  longitude: number | null;
};

export type ServiceLocationLevel = "province" | "city" | "district";

export type ServiceLocation = {
  id: number;
  parent_id: number | null;
  code: string;
  name: string;
  level: ServiceLocationLevel;
};

export type ServiceAreaSelection = {
  serviceLocationId: number;
  serviceProvince: string;
  label: string;
};
