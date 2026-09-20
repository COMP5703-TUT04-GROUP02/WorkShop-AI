export type ProviderSearchSort =
  | "recommended"
  | "nearest"
  | "lowestPrice"
  | "highestRating";

export type ProviderSearchFilters = {
  category: string | null;
  maxDistanceKm: number | null;
  minPrice: string;
  maxPrice: string;
  minRating: number | null;
  availability: "any" | "open" | "closed";
  sort: ProviderSearchSort;
};

export type ProviderSearchQueryParams = {
  tags?: string;
  max_distance_km?: number;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  is_open?: boolean;
  sort_by?: "nearest" | "lowest_price" | "highest_rating";
};

const SORT_QUERY_VALUES: Record<
  Exclude<ProviderSearchSort, "recommended">,
  NonNullable<ProviderSearchQueryParams["sort_by"]>
> = {
  nearest: "nearest",
  lowestPrice: "lowest_price",
  highestRating: "highest_rating",
};

export function createDefaultSearchFilters(
  initialCategory: string | null = null,
): ProviderSearchFilters {
  return {
    category: initialCategory,
    maxDistanceKm: null,
    minPrice: "",
    maxPrice: "",
    minRating: null,
    availability: "any",
    sort: "recommended",
  };
}

export function countActiveSearchFilters(filters: ProviderSearchFilters) {
  let count = 0;

  if (filters.category) count += 1;
  if (filters.maxDistanceKm !== null) count += 1;
  if (filters.minPrice.trim() || filters.maxPrice.trim()) count += 1;
  if (filters.minRating !== null) count += 1;
  if (filters.availability !== "any") count += 1;
  if (filters.sort !== "recommended") count += 1;

  return count;
}

export function parseOptionalNonNegativeInteger(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;

  const parsedValue = Number(trimmedValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) return undefined;

  return parsedValue;
}

export function buildProviderSearchParams(
  filters: ProviderSearchFilters,
): ProviderSearchQueryParams {
  const minPrice = parseOptionalNonNegativeInteger(filters.minPrice);
  const maxPrice = parseOptionalNonNegativeInteger(filters.maxPrice);

  return {
    ...(filters.category ? { tags: filters.category } : {}),
    ...(filters.maxDistanceKm !== null
      ? { max_distance_km: filters.maxDistanceKm }
      : {}),
    ...(minPrice !== undefined ? { min_price: minPrice } : {}),
    ...(maxPrice !== undefined ? { max_price: maxPrice } : {}),
    ...(filters.minRating !== null ? { min_rating: filters.minRating } : {}),
    ...(filters.availability !== "any"
      ? { is_open: filters.availability === "open" }
      : {}),
    ...(filters.sort !== "recommended"
      ? { sort_by: SORT_QUERY_VALUES[filters.sort] }
      : {}),
  };
}

export function getSearchFilterValidationError(filters: ProviderSearchFilters) {
  const minPrice = parseOptionalNonNegativeInteger(filters.minPrice);
  const maxPrice = parseOptionalNonNegativeInteger(filters.maxPrice);
  const hasInvalidPrice =
    (filters.minPrice.trim() && minPrice === undefined) ||
    (filters.maxPrice.trim() && maxPrice === undefined);

  if (hasInvalidPrice) return "Enter a valid hourly price.";
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return "Minimum price cannot exceed maximum price.";
  }

  return null;
}
