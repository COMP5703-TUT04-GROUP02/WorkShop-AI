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

export function isQualificationApproved(profile: ProviderProfile | null) {
  return getQualificationStatus(profile) === "approved";
}

/** Qualification review cannot start until identity is approved. */
export function canApplyForQualification(profile: ProviderProfile | null) {
  return (
    getIdentityStatus(profile) === "approved" &&
    getQualificationStatus(profile) !== "approved"
  );
}

export function describeStatus(status: VerificationStatus) {
  if (status === "approved") {
    return "Approved";
  }

  return status === "rejected" ? "Not approved" : "Under review";
}
