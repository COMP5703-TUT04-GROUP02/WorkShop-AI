import type { RefundServiceStage } from "../types/booking";

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  quoted: "Quoted",
  awaiting_payment: "Awaiting payment",
  accepted: "In progress",
  rejected: "Declined",
  refunding: "Refund in progress",
  refunded: "Refunded",
  awaiting_confirmation: "Awaiting confirmation",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const BOOKING_STATUS_LABELS_CHAT: Record<string, string> = {
  pending: "Pending review",
  quoted: "Quote awaiting confirmation",
  awaiting_payment: "Awaiting payment",
  accepted: "In progress",
  rejected: "Declined",
  refunding: "Refund in progress",
  refunded: "Refunded",
  awaiting_confirmation: "Awaiting confirmation",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Declined",
  appealed: "Under review",
  admin_rejected: "Appeal declined",
  cancelled: "Cancelled",
};

export const REFUND_SERVICE_STAGE_LABELS: Record<RefundServiceStage, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  service_completed: "Service completed",
};

export const REFUND_SERVICE_STAGE_OPTIONS: Array<{
  label: string;
  value: RefundServiceStage;
}> = [
  { label: "Not started", value: "not_started" },
  { label: "In progress", value: "in_progress" },
  { label: "Service completed", value: "service_completed" },
];

export const WEEKDAY_LABELS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export function getBookingStatusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status] ?? status;
}

export function getBookingStatusLabelForChat(status: string) {
  return BOOKING_STATUS_LABELS_CHAT[status] ?? status;
}

export function getRefundStatusLabel(status: string) {
  return REFUND_STATUS_LABELS[status] ?? status;
}

export function getRefundServiceStageLabel(stage: string) {
  return REFUND_SERVICE_STAGE_LABELS[stage as RefundServiceStage] ?? stage;
}

export function getWeekdayLabel(weekday: number) {
  return WEEKDAY_LABELS.find((item) => item.value === weekday)?.label ?? `Day ${weekday}`;
}
