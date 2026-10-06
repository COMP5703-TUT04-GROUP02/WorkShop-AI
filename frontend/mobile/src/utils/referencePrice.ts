import type { ReferencePriceRange } from "../types/booking";

export type ReferencePriceAudience = "provider" | "customer";

const CUSTOMER_QUOTE_VISIBLE_STATUSES = new Set([
  "quoted",
  "awaiting_payment",
  "awaiting_visit_payment",
  "visit_paid",
  "provider_arrived",
  "awaiting_final_quote",
  "final_quote_sent",
  "awaiting_service_payment",
  "service_paid",
  "accepted",
  "awaiting_confirmation",
  "completed",
]);

const wholeNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function buildReferencePricePresentation(
  range: ReferencePriceRange | null | undefined,
  audience: ReferencePriceAudience,
) {
  const label =
    audience === "provider"
      ? "Recommended price range"
      : "Typical range for similar jobs";

  if (
    range?.has_history &&
    range.minimum != null &&
    range.maximum != null
  ) {
    return {
      label,
      value: `₺${wholeNumberFormatter.format(range.minimum)}–₺${wholeNumberFormatter.format(range.maximum)}`,
    };
  }

  return {
    label,
    value:
      audience === "customer" ? "No historical data for similar jobs" : null,
  };
}

export function shouldShowCustomerReferencePrice(status: string) {
  return CUSTOMER_QUOTE_VISIBLE_STATUSES.has(status);
}
