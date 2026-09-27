import type { BookingStatus, PaymentSummary } from "../types/booking";

export type PaymentAction = "pay" | "continue" | "processing" | null;

export function createPaymentIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return `payment-${cryptoApi.randomUUID()}`;
  }

  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shouldRotatePaymentIdempotencyKey(
  payment?: { status?: string | null } | null,
) {
  return payment?.status === "failed";
}

export function getPaymentAction(
  bookingStatus: BookingStatus | string,
  payment?: PaymentSummary | null,
): PaymentAction {
  if (bookingStatus !== "awaiting_payment") {
    return null;
  }

  if (payment?.status === "checkout_created") {
    return "continue";
  }

  if (payment?.status === "processing") {
    return "processing";
  }

  return "pay";
}

export function getPaymentStatusTone(status?: string | null) {
  if (status === "paid") {
    return "success" as const;
  }
  if (status === "failed") {
    return "danger" as const;
  }
  if (status === "refunded") {
    return "muted" as const;
  }
  return "warning" as const;
}
