export type CustomerProfile = {
  id: number;
  user_id: number;
  phone_number: string;
  address: string;
  service_province: string;
  service_location_id: number | null;
  latitude: number | null;
  longitude: number | null;
  current_address: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  default_service_address: string | null;
  default_service_latitude: number | null;
  default_service_longitude: number | null;
  notes: string | null;
};

export type CustomerProfileUpdateResponse = {
  message: string;
  profile: CustomerProfile;
};

export type CustomerProfilePayload = {
  phone_number: string;
  address: string;
  service_province: string;
  service_location_id: number | null;
  latitude: number | null;
  longitude: number | null;
  current_address: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  default_service_address: string | null;
  default_service_latitude: number | null;
  default_service_longitude: number | null;
  notes: string | null;
};

export type CustomerProfilePatchPayload = Partial<CustomerProfilePayload>;

/** WS-98 / WS-99. What the address book stores, and what the picker produces. */
export type CustomerAddressPayload = {
  label: string;
  place_id: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  service_location_id?: number | null;
  is_default?: boolean;
};

export type CustomerAddress = CustomerAddressPayload & {
  id: number;
  customer_id: number;
  is_default: boolean;
};
