import type { Review } from "./review";

export type ReviewRiskLevel = "low" | "medium" | "high";

export type ReviewRiskStatus = "pending" | "confirmed_fake" | "dismissed";

export type ReviewRiskSignal = {
  code: string;
  label: string;
  weight: number;
  detail: string;
};

export type ReviewRiskAssessment = {
  id: number;
  review_id: number;
  provider_profile_id: number;
  score: number;
  level: ReviewRiskLevel;
  status: ReviewRiskStatus;
  signals: ReviewRiskSignal[];
  reported_by_provider: boolean;
  provider_report_reason: string | null;
  provider_reported_at: string | null;
  decided_by_user_id: number | null;
  decided_at: string | null;
  decision_note: string | null;
  evaluated_at: string | null;
  created_at: string | null;
};

export type FlaggedReview = {
  risk: ReviewRiskAssessment;
  review: Review | null;
  provider_business_name: string | null;
};

export type ReviewRiskRescanResult = {
  scanned: number;
  high: number;
  medium: number;
  low: number;
};
