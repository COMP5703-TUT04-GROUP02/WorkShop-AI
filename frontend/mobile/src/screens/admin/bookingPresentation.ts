import { BOOKING_STATUS_LABELS } from "../../constants/labels";
import { colors } from "../../theme/theme";
import type { AdminBookingFilters } from "../../types/adminBooking";
import { parseDateTime } from "../../utils/datetime";

// Match the existing Customer/Provider booking badges, not a new colour system.
const TONES = {
  success: { backgroundColor: "#ECFDF3", color: colors.primary },
  warning: { backgroundColor: "#FFF7ED", color: "#C2410C" },
  neutral: { backgroundColor: "#EEF2FF", color: "#3730A3" },
  muted: { backgroundColor: colors.surface, color: colors.mutedText },
  danger: { backgroundColor: "#FEF2F2", color: colors.danger },
};

export function bookingStatusStyle(status: string) {
  if (["completed", "accepted", "visit_paid", "service_paid"].includes(status)) return TONES.success;
  if (status === "provider_no_show") return TONES.danger;
  if (["rejected", "cancelled", "cancelled_before_visit", "refunded", "partially_refunded", "visit_completed_closed", "service_cancelled_after_payment"].includes(status)) return TONES.muted;
  if (["pending", "awaiting_payment", "awaiting_visit_payment", "awaiting_service_payment", "final_quote_sent", "awaiting_confirmation", "refunding"].includes(status)) return TONES.warning;
  return TONES.neutral;
}

const DISTINCT_CLOSED_LABELS: Record<string, string> = {
  cancelled_before_visit: "Closed — cancelled before visit",
  provider_no_show: "Closed — provider no-show",
  visit_completed_closed: "Closed — visit completed",
  service_cancelled_after_payment: "Closed — service cancelled after payment",
};

export const BOOKING_STATUS_OPTIONS = Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => ({
  value, label: DISTINCT_CLOSED_LABELS[value] ?? label,
}));

export function bookingFiltersForStatus(applied: AdminBookingFilters, status?: string): AdminBookingFilters {
  return { ...applied, status };
}

/** English UI; retain the same device-local timezone as the existing formatter. */
export function formatBookingDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = parseDateTime(value);
  return date ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
