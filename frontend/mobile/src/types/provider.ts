export type ProviderProfile = {
  id: number;
  user_id: number;
  business_name: string;
  bio: string;
  phone_number: string;
  address: string;
  service_province: string;
  service_location_id: number | null;
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
  tags: string[];
  certificate_name: string;
  certificate_url: string;
  certificate_files: ProviderCertificateFile[];
  hourly_rate: number;
  experience_years: number;
  verification_status: string;
  verification_note: string | null;
  notes: string | null;
  is_online: boolean;
  average_rating?: number | null;
  review_count?: number;
  distance_km?: number | null;
};

export type ProviderCertificateFile = {
  id: number;
  provider_profile_id: number;
  file_url: string;
  original_file_name: string;
  content_type: string;
  media_type: "image" | "video" | "document" | string;
  sort_order: number;
  created_at: string;
};

export type ProviderContactProfilePayload = {
  phone_number: string;
  address: string;
  service_province: string;
  service_location_id: number | null;
  notes: string | null;
};

export type ProviderContactProfilePatchPayload =
  Partial<ProviderContactProfilePayload>;

export type ProviderContactProfileUpdateResponse = {
  message: string;
  profile: ProviderProfile;
};

export type ProviderProfilePayload = {
  business_name: string;
  bio: string;
  phone_number: string;
  address: string;
  service_province: string;
  service_location_id: number | null;
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
  tags: string[];
  certificate_name: string;
  certificate_url: string;
  certificate_files: Array<{
    file_url: string;
    original_file_name: string;
    content_type: string;
    media_type: string;
    sort_order: number;
  }>;
  hourly_rate: number;
  experience_years: number;
  notes: string | null;
};

export type ProviderProfileMutationResponse = {
  message: string;
  profile: ProviderProfile;
};

export type ProviderAvailability = {
  id: number;
  provider_profile_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

export type ProviderAvailabilityOverride = {
  id: number;
  provider_profile_id: number;
  override_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export type ProviderAvailabilityResponseData = {
  availabilities: ProviderAvailability[];
};

export type ProviderAvailabilityUpdateResponseData = {
  message: string;
  availabilities: ProviderAvailability[];
};

export type ProviderPortfolioMedia = {
  id: number;
  portfolio_id: number;
  file_url: string;
  original_file_name: string | null;
  content_type: string | null;
  media_type: "image" | "video" | string;
  sort_order: number;
  created_at: string;
};

export type ProviderPortfolio = {
  id: number;
  provider_profile_id: number;
  title: string;
  description: string | null;
  image_url: string;
  original_file_name: string | null;
  content_type: string | null;
  media_type: "image" | "video" | string;
  media_items: ProviderPortfolioMedia[];
  verification_status: "pending" | "approved" | "rejected" | string;
  verification_note: string | null;
  created_at: string;
};

export type ProviderRecommendation = ProviderProfile & {
  first_portfolio_image_url: string | null;
  recommendation_score: number;
  matched_tags: string[];
  recommendation_reasons: string[];
};

export type CustomerHomeRecommendations = {
  service_province: string;
  service_location_id: number | null;
  history_provider_tag: string;
  items: ProviderRecommendation[];
};

export type CustomerProviderSearchResults = {
  keyword: string;
  tokens: string[];
  service_province: string;
  service_location_id: number | null;
  items: ProviderRecommendation[];
};

export type CustomerProviderDetail = {
  provider: CustomerProviderDetailProfile;
  history: {
    id: number;
    customer_id: number;
    last_provider_profile_id: number | null;
    last_provider_tag: string;
    updated_at: string;
  };
};

export type CustomerProviderDetailProfile = ProviderProfile & {
  is_open: boolean;
  is_favorited: boolean;
};

export type FavoriteProvider = {
  id: number;
  customer_id: number;
  provider_profile_id: number;
  created_at: string;
  provider: ProviderProfile | null;
};

export type AddFavoriteProviderResponse = {
  message: string;
  favorite: FavoriteProvider;
};

export type RemoveFavoriteProviderResponse = {
  message: string;
};
