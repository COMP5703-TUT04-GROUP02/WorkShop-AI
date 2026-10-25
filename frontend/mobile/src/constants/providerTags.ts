export const PROVIDER_TAGS = [
  "cleaning",
  "childcare",
  "elderly_care",
  "electrician",
  "plumbing",
  "painter",
  "locksmith",
  "technician",
  "moving",
  "other",
] as const;

export type ProviderTag = (typeof PROVIDER_TAGS)[number];

export const PROVIDER_TAG_LABELS: Record<ProviderTag, string> = {
  cleaning: "Cleaning",
  childcare: "Childcare",
  elderly_care: "Elderly care",
  electrician: "Electrician",
  plumbing: "Plumbing",
  painter: "Painter",
  locksmith: "Locksmith",
  technician: "Technician",
  moving: "Moving",
  other: "Other",
};

export const DEFAULT_PROVIDER_TAG: ProviderTag = "cleaning";

export function getProviderTagLabel(tag: string) {
  return PROVIDER_TAG_LABELS[tag as ProviderTag] ?? tag;
}

/**
 * Verification outcomes, in words rather than column values. An admin reading
 * a queue should see what state a thing is in, not the enum behind it.
 */
export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting on review",
  approved: "Approved",
  rejected: "Rejected",
  not_submitted: "Not submitted",
};

export function getVerificationStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "Not submitted";
  }

  return VERIFICATION_STATUS_LABELS[status] ?? status;
}
