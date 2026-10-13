export type HelpLinkTarget = {
  faqId: string;
  label: string;
};

export type BookingHelpState = {
  paymentFailed: boolean;
  canCancelAfterVisit: boolean;
  canRequestRefund: boolean;
  canAppealRefund: boolean;
  canConfirmComplete: boolean;
};

const FAILED_PAYMENT_STATUSES = ["failed", "capture_failed"];

export function isPaymentFailed(
  paymentStatus: string | null | undefined,
  failureMessage: string | null | undefined,
) {
  return FAILED_PAYMENT_STATUSES.includes(paymentStatus ?? "") || Boolean(failureMessage);
}

/**
 * Help answers for the decisions a customer is facing right now. IDs refer to
 * backend/content/faq/customer.md and must stay in step with it.
 */
export function getBookingHelpLinks(state: BookingHelpState): HelpLinkTarget[] {
  const links: HelpLinkTarget[] = [];
  if (state.paymentFailed) {
    links.push({ faqId: "CUST-PAY-007", label: "Payment not going through?" });
  }
  if (state.canConfirmComplete) {
    links.push({ faqId: "CUST-SVC-005", label: "Not happy with the work?" });
  }
  if (state.canCancelAfterVisit) {
    links.push({ faqId: "CUST-REF-003", label: "Does cancelling refund my payment?" });
  }
  if (state.canRequestRefund) {
    links.push({ faqId: "CUST-REF-005", label: "How do refunds work?" });
  }
  if (state.canAppealRefund) {
    links.push({ faqId: "CUST-REF-007", label: "How do refund appeals work?" });
  }
  return links;
}
