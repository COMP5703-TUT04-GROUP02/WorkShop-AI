import type { User } from "./auth";

export type Review = {
  id: number;
  booking_id: number;
  customer_id: number;
  provider_profile_id: number;
  rating: number;
  comment: string | null;
  created_at: string | null;
  is_visible: boolean;
  embedding_status: string | null;
  embedding_error: string | null;
  embedding_synced_at: string | null;
  customer?: User | null;
};

/** A visible review whose booking was too cheap to be a real job. */
export type LowValueReview = Review & {
  booking_total_amount: number | null;
  provider_business_name: string | null;
};
