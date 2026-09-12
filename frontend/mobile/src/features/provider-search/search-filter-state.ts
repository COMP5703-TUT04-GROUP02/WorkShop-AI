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
  openNowOnly: boolean;
  sort: ProviderSearchSort;
};

export function createDefaultSearchFilters(): ProviderSearchFilters {
  return {
    category: null,
    maxDistanceKm: null,
    minPrice: "",
    maxPrice: "",
    minRating: null,
    openNowOnly: false,
    sort: "recommended",
  };
}

export function countActiveSearchFilters(filters: ProviderSearchFilters) {
  let count = 0;

  if (filters.category) count += 1;
  if (filters.maxDistanceKm !== null) count += 1;
  if (filters.minPrice.trim() || filters.maxPrice.trim()) count += 1;
  if (filters.minRating !== null) count += 1;
  if (filters.openNowOnly) count += 1;
  if (filters.sort !== "recommended") count += 1;

  return count;
}

export function parseOptionalNonNegativeNumber(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return undefined;

  return parsedValue;
}

export function getSearchFilterValidationError(filters: ProviderSearchFilters) {
  const minPrice = parseOptionalNonNegativeNumber(filters.minPrice);
  const maxPrice = parseOptionalNonNegativeNumber(filters.maxPrice);
  const hasInvalidPrice =
    (filters.minPrice.trim() && minPrice === undefined) ||
    (filters.maxPrice.trim() && maxPrice === undefined);

  if (hasInvalidPrice) return "Enter a valid hourly price.";
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return "Minimum price cannot exceed maximum price.";
  }

  return null;
}
