import type { BookingDetail } from "./booking";

export type AdminBookingFilters = {
  bookingId?: number;
  customerId?: number;
  providerProfileId?: number;
};

/** Explicit, read-only business records; never checkout credentials. */
export type AdminBookingRecord = Record<string, string | number | boolean | null>;
export type AdminBookingDetail = BookingDetail & {
  onboarding_paused: boolean;
  onboarding_pause_reason: string | null;
  onboarding_paused_at: string | null;
  complaint_summary: {
    has_open_complaint: boolean;
    open_complaint_count: number;
    total_complaint_count: number;
  };
  status_history: AdminBookingRecord[];
  quote_revisions: AdminBookingRecord[];
  payments: Array<{
    [key: string]: string | number | boolean | null | AdminBookingRecord;
    id: number;
    settlement: AdminBookingRecord | null;
  }>;
  refund_requests: AdminBookingRecord[];
  complaints: AdminBookingRecord[];
  reviews: AdminBookingRecord[];
};
