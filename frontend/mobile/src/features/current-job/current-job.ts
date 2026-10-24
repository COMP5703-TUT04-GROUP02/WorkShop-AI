import { BOOKING_STATUS_LABELS } from "../../constants/labels";
import type { BookingDetail } from "../../types/booking";

/**
 * Statuses where the next move is the customer's, most urgent first. A booking
 * in any other status is waiting on the provider or the platform, so the
 * sidebar stays quiet about it.
 */
export const CUSTOMER_ACTION_STATUSES = [
  "awaiting_visit_payment",
  "awaiting_payment",
  "awaiting_service_payment",
  "final_quote_sent",
  "quoted",
  "awaiting_confirmation",
] as const;

/** Live, but waiting on someone else. */
export const CUSTOMER_IN_FLIGHT_STATUSES = [
  "provider_arrived",
  "visit_paid",
  "awaiting_final_quote",
  "service_paid",
  "accepted",
  "pending",
] as const;

export type CurrentJob = {
  id: number;
  title: string;
  statusLabel: string;
  /** What the customer still owes, when the status is a payment one. */
  amountDue: number | null;
  /** True when the booking waits on the customer rather than the provider. */
  needsCustomer: boolean;
};

type JobInput = Pick<
  BookingDetail,
  "id" | "title" | "status" | "total_amount" | "visit_fee_amount"
>;

type BookingPage = {
  items: JobInput[];
  has_next: boolean;
};

/** Check every page so an older live booking is not hidden by recent history. */
export async function findCurrentJob(
  loadPage: (page: number, pageSize: number) => Promise<BookingPage | null>,
): Promise<CurrentJob | null> {
  const bookings: JobInput[] = [];

  for (let page = 1; ; page += 1) {
    const result = await loadPage(page, 100);
    if (!result) return pickCurrentJob(bookings);
    bookings.push(...result.items);
    if (!result.has_next || result.items.length === 0) {
      return pickCurrentJob(bookings);
    }
  }
}

function rank(status: string) {
  const action = CUSTOMER_ACTION_STATUSES.indexOf(
    status as (typeof CUSTOMER_ACTION_STATUSES)[number],
  );
  if (action >= 0) return action;
  const inFlight = CUSTOMER_IN_FLIGHT_STATUSES.indexOf(
    status as (typeof CUSTOMER_IN_FLIGHT_STATUSES)[number],
  );
  if (inFlight >= 0) return CUSTOMER_ACTION_STATUSES.length + inFlight;
  return -1;
}

function amountDue(booking: JobInput) {
  if (booking.status === "awaiting_visit_payment") {
    return booking.visit_fee_amount ?? null;
  }
  if (booking.status === "awaiting_service_payment") {
    return booking.total_amount ?? null;
  }
  return null;
}

/**
 * The one booking worth pinning to the sidebar: whatever waits on the
 * customer, and only otherwise whatever is still running.
 */
export function pickCurrentJob(bookings: JobInput[]): CurrentJob | null {
  let best: JobInput | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const booking of bookings) {
    const value = rank(booking.status);
    if (value < 0 || value >= bestRank) continue;
    best = booking;
    bestRank = value;
  }

  if (!best) return null;

  return {
    id: best.id,
    title: best.title,
    statusLabel: BOOKING_STATUS_LABELS[best.status] ?? best.status,
    amountDue: amountDue(best),
    needsCustomer: bestRank < CUSTOMER_ACTION_STATUSES.length,
  };
}
