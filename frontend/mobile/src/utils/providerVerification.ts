import type { ProviderProfile } from "../types/provider";

/**
 * WS-105. A provider is reviewed in two independent steps: identity first,
 * then qualification. Only an approved qualification unlocks schedule,
 * bookings, chat, portfolios and being searchable — filling in the profile
 * form is not enough.
 *
 * WS-104 adds the two fields. Until it merges, a backend that only knows the
 * single verification_status still answers correctly: both steps fall back to
 * it, so an approved provider stays unlocked and a pending one stays gated.
 */
export type VerificationStatus = "approved" | "pending" | "rejected";

/**
 * Qualification review cannot start before identity is approved, so that step
 * is neither approved nor under review — it has not begun. "pending" would
 * read as "an admin is looking at it", which is not true yet.
 */
export type StepState = VerificationStatus | "locked";

function normalise(value: string | null | undefined): VerificationStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

export function getIdentityStatus(
  profile: ProviderProfile | null,
): VerificationStatus {
  if (!profile) {
    return "pending";
  }

  return normalise(
    profile.identity_verification_status ?? profile.verification_status,
  );
}

export function getQualificationStatus(
  profile: ProviderProfile | null,
): VerificationStatus {
  if (!profile) {
    return "pending";
  }

  return normalise(
    profile.qualification_verification_status ?? profile.verification_status,
  );
}

export function getQualificationStepState(
  profile: ProviderProfile | null,
): StepState {
  if (getIdentityStatus(profile) !== "approved") {
    return "locked";
  }

  return getQualificationStatus(profile);
}

export function isQualificationApproved(profile: ProviderProfile | null) {
  return getQualificationStatus(profile) === "approved";
}

export function describeStatus(status: StepState) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "rejected") {
    return "Not approved";
  }

  return status === "locked" ? "Locked" : "Under review";
}

/**
 * The backend cannot tell "never submitted" from "submitted and waiting", so
 * the action says what it does to an existing submission rather than implying
 * the step has not started.
 */
export function describeStepAction(state: StepState, step: "identity" | "qualification") {
  if (state === "approved" || state === "locked") {
    return null;
  }

  if (state === "rejected") {
    return "Resubmit";
  }

  return step === "identity" ? "Identity details" : "Update submission";
}
