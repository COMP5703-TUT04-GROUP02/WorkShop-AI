import { getBookingStatusLabel } from "../../constants/labels";
import { colors } from "../../theme/theme";
import type { AdminBookingFilters, AdminBookingStatusGroup } from "../../types/adminBooking";
import { parseDateTime } from "../../utils/datetime";
import { currentLocale, getCurrentLanguage } from "../../i18n/language";
import { translateText } from "../../i18n/translations";

// Retain system success/warning/neutral tones; avoid saturated indigo blocks.
const TONES = {
  success: { backgroundColor: "#ECFDF3", color: colors.primary },
  warning: { backgroundColor: "#FFF7ED", color: "#C2410C" },
  neutral: { backgroundColor: "#F0F3F5", color: "#526779" },
  refund: { backgroundColor: "#F7F3EC", color: "#80684B" },
  muted: { backgroundColor: colors.surface, color: colors.mutedText },
};

export const BOOKING_STATUS_OPTIONS = [
  { value: "pending", label: "Pending", statuses: ["pending", "quoted"] },
  { value: "awaiting_payment", label: "Awaiting payment", statuses: ["awaiting_payment", "awaiting_visit_payment", "awaiting_service_payment"] },
  { value: "in_progress", label: "In progress", statuses: ["visit_paid", "provider_arrived", "awaiting_final_quote", "final_quote_sent", "service_paid", "accepted", "awaiting_confirmation"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "refund_related", label: "Refund related", statuses: ["refunding", "refunded", "partially_refunded"] },
  { value: "closed", label: "Closed", statuses: ["rejected", "cancelled", "cancelled_before_visit", "provider_no_show", "visit_completed_closed", "service_cancelled_after_payment"] },
] as const;

function bookingGroup(status: string) {
  return BOOKING_STATUS_OPTIONS.find(group => group.statuses.some(item => item === status));
}

export function bookingGroupLabel(status: string) {
  return translateText(getCurrentLanguage(), bookingGroup(status)?.label ?? getBookingStatusLabel(status));
}

export function bookingStatusStyle(status: string) {
  switch (bookingGroup(status)?.value) {
    case "completed": return TONES.success;
    case "pending": case "awaiting_payment": return TONES.warning;
    case "in_progress": return TONES.neutral;
    case "refund_related": return TONES.refund;
    default: return TONES.muted;
  }
}

export function bookingFiltersForStatus(applied: AdminBookingFilters, statusGroup?: AdminBookingStatusGroup): AdminBookingFilters {
  return { ...applied, statusGroup };
}

/** Retain the device-local timezone while formatting in the chosen UI language. */
export function formatBookingDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = parseDateTime(value);
  return date ? date.toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" }) : "—";
}
