import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { BookingDetail, PaymentHistoryEntry, RefundRequestSummary } from "../types/booking";
import type { AdminBookingDetail, AdminBookingFilters } from "../types/adminBooking";
import type { PaginatedData } from "../types/chat";
import type { LowValueReview } from "../types/review";
import type { AdminSubmerchant } from "../types/marketplace";
import type {
  IdentityVerificationApplication,
  ProviderPortfolio,
  ProviderProfile,
  QualificationVerificationApplication,
} from "../types/provider";

export async function getAdminIdentityVerifications(status = "pending") {
  const response = await apiClient.get<ApiResponse<IdentityVerificationApplication[]>>(
    "/admin/identity-verifications",
    { params: { status } },
  );
  return response.data.data ?? [];
}

export async function decideAdminIdentityVerification(
  applicationId: number,
  status: "approved" | "rejected",
  reviewNote?: string,
) {
  const response = await apiClient.put<ApiResponse<IdentityVerificationApplication>>(
    `/admin/identity-verifications/${applicationId}/decision`,
    { status, review_note: reviewNote || null },
  );
  return response.data.data;
}

export async function getAdminQualificationVerifications(status = "pending") {
  const response = await apiClient.get<ApiResponse<QualificationVerificationApplication[]>>(
    "/admin/qualification-verifications",
    { params: { status } },
  );
  return response.data.data ?? [];
}

export async function decideAdminQualificationVerification(
  applicationId: number,
  status: "approved" | "rejected",
  reviewNote?: string,
) {
  const response = await apiClient.put<
    ApiResponse<{
      application: QualificationVerificationApplication;
      provider_profile_id: number | null;
    }>
  >(`/admin/qualification-verifications/${applicationId}/decision`, {
    status,
    review_note: reviewNote || null,
  });
  return response.data.data;
}

export async function downloadVerificationFile(fileUrl: string) {
  const response = await apiClient.get<Blob>(fileUrl, { responseType: "blob" });
  return response.data;
}

export async function getPendingProviderProfiles(page = 1, pageSize = 20) {
  const response = await apiClient.get<ApiResponse<PaginatedData<ProviderProfile>>>(
    "/admin/providers",
    {
      params: {
        verification_status: "pending",
        page,
        page_size: pageSize,
      },
    },
  );

  return response.data.data;
}

export async function getAdminProviderProfile(providerProfileId: number) {
  const response = await apiClient.get<ApiResponse<ProviderProfile>>(
    `/admin/providers/${providerProfileId}`,
  );

  return response.data.data;
}

export async function updateAdminProviderProfileVerification(
  providerProfileId: number,
  verificationStatus: "approved" | "rejected",
  verificationNote: string,
) {
  const response = await apiClient.put<
    ApiResponse<{
      message: string;
      profile: ProviderProfile;
    }>
  >(`/admin/providers/${providerProfileId}/verification`, {
    verification_status: verificationStatus,
    verification_note: verificationNote,
  });

  return response.data.data;
}

export type AdminRecordFilters = {
  providerProfileId?: number;
  customerId?: number;
  refundRequestId?: number;
  status?: string;
};

export async function getAdminBookings(page = 1, pageSize = 20, filters: AdminBookingFilters = {}) {
  const response = await apiClient.get<ApiResponse<PaginatedData<BookingDetail>>>(
    "/admin/bookings",
    { params: { page, page_size: pageSize, booking_id: filters.bookingId,
      customer_id: filters.customerId, provider_profile_id: filters.providerProfileId } },
  );
  return response.data.data;
}

export async function getAdminBooking(bookingId: number) {
  const response = await apiClient.get<ApiResponse<AdminBookingDetail>>(`/admin/bookings/${bookingId}`);
  return response.data.data;
}

export async function setAdminReviewVisibility(reviewId: number, isVisible: boolean) {
  const response = await apiClient.put(`/admin/reviews/${reviewId}/visibility`, { is_visible: isVisible });
  return response.data.data;
}

export async function getPendingProviderPortfolios(page = 1, pageSize = 20, filters: AdminRecordFilters = {}) {
  const response = await apiClient.get<ApiResponse<PaginatedData<ProviderPortfolio>>>(
    "/admin/provider-portfolios",
    {
      params: {
        verification_status: "pending",
        provider_profile_id: filters.providerProfileId,
        page,
        page_size: pageSize,
      },
    },
  );

  return response.data.data;
}

export async function getAdminProviderPortfolioItem(portfolioId: number) {
  const response = await apiClient.get<ApiResponse<ProviderPortfolio>>(
    `/admin/provider-portfolios/${portfolioId}`,
  );

  return response.data.data;
}

export async function updateAdminProviderPortfolioVerification(
  portfolioId: number,
  verificationStatus: "approved" | "rejected",
  verificationNote: string,
) {
  const response = await apiClient.put<
    ApiResponse<{
      message: string;
      portfolio: ProviderPortfolio;
    }>
  >(`/admin/provider-portfolios/${portfolioId}/verification`, {
    verification_status: verificationStatus,
    verification_note: verificationNote,
  });

  return response.data.data;
}

export async function getPendingRefundAppeals(page = 1, pageSize = 20, filters: AdminRecordFilters = {}) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<RefundRequestSummary>>
  >("/admin/refund-requests", {
    params: {
      status: "appealed",
      refund_request_id: filters.refundRequestId,
      customer_id: filters.customerId,
      provider_profile_id: filters.providerProfileId,
      page,
      page_size: pageSize,
    },
  });

  return response.data.data;
}

export async function approveAdminRefundAppeal(
  refundRequestId: number,
  adminNote: string,
) {
  const response = await apiClient.put<
    ApiResponse<{
      message: string;
      refund_request: RefundRequestSummary;
    }>
  >(`/admin/refund-requests/${refundRequestId}/approve`, {
    admin_note: adminNote,
  });

  return response.data.data;
}

export async function rejectAdminRefundAppeal(
  refundRequestId: number,
  adminNote: string,
) {
  const response = await apiClient.put<
    ApiResponse<{
      message: string;
      refund_request: RefundRequestSummary;
    }>
  >(`/admin/refund-requests/${refundRequestId}/reject`, {
    admin_note: adminNote,
  });

  return response.data.data;
}

export async function getAdminSubmerchants(page = 1, pageSize = 20, filters: AdminRecordFilters = {}) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<AdminSubmerchant>>
  >("/admin/submerchants", {
    params: { page, page_size: pageSize, status: filters.status, provider_profile_id: filters.providerProfileId },
  });
  return response.data.data;
}

export async function getAdminPayments(
  page = 1,
  pageSize = 20,
  filters?: {
    status?: string;
    settlementStatus?: string;
    providerProfileId?: number;
    bookingId?: number;
  },
) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<PaymentHistoryEntry>>
  >("/admin/payments", {
    params: {
      page,
      page_size: pageSize,
      status: filters?.status || undefined,
      settlement_status: filters?.settlementStatus || undefined,
      provider_profile_id: filters?.providerProfileId,
      booking_id: filters?.bookingId,
    },
  });
  return response.data.data;
}

export async function retryAdminSettlement(paymentId: number) {
  const response = await apiClient.post<
    ApiResponse<{ message: string; payment: PaymentHistoryEntry }>
  >(`/admin/payments/${paymentId}/settlement/retry`);
  return response.data.data;
}

export type ReviewEmbeddingSyncStatus = {
  total: number;
  pending: number;
  synced: number;
  failed: number;
  deleted: number;
  unknown: number;
};

export type EmbeddingHealth = {
  embedding: string;
  dimension: number;
  preview: number[];
};

export type MilvusHealth = {
  milvus: string;
  server_version: string;
};

export type ReviewEmbeddingTask = {
  id: number;
  task_id: string;
  user_id: number | null;
  task_type: string;
  status: string;
  result: Record<string, unknown> | string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export async function getReviewEmbeddingSyncStatus() {
  const response = await apiClient.get<ApiResponse<ReviewEmbeddingSyncStatus>>(
    "/ai/milvus/review-sync-status",
  );
  return response.data.data;
}

export async function getEmbeddingHealth() {
  const response = await apiClient.get<ApiResponse<EmbeddingHealth>>(
    "/ai/health/embedding",
  );
  return response.data.data;
}

export async function getMilvusHealth() {
  const response = await apiClient.get<ApiResponse<MilvusHealth>>(
    "/ai/health/milvus",
  );
  return response.data.data;
}

export async function syncAllReviewEmbeddings() {
  const response = await apiClient.post<
    ApiResponse<{ task_id: string | null; message: string }>
  >("/ai/milvus/sync-reviews");
  return response.data.data;
}

export async function retryPendingReviewEmbeddings() {
  const response = await apiClient.post<
    ApiResponse<{ review_count: number; task_ids: Array<string | null>; message: string }>
  >("/ai/milvus/retry-failed-reviews");
  return response.data.data;
}

export async function getReviewEmbeddingTask(taskId: string) {
  const response = await apiClient.get<ApiResponse<ReviewEmbeddingTask>>(
    `/ai/tasks/${taskId}`,
  );
  return response.data.data;
}

export type LLMAuthMode = "key" | "chatgpt" | "grok";

export type LLMKeySource = "admin" | "env" | "none";

export type LLMOauthProviderStatus = {
  connected: boolean;
  pending: boolean;
  status: string;
  user_code?: string;
  url?: string;
  error?: string;
  note?: string;
};

export type LLMKeyStatus = {
  configured: boolean;
  source: LLMKeySource;
  provider: string;
  model: string;
  base_url: string;
  api_key_preview: string;
};

export type LLMProviderChoice = {
  id: string;
  label: string;
};

export type LLMOauthStatus = {
  auth: LLMAuthMode;
  saved_auth: LLMAuthMode;
  llm_provider: string;
  providers: LLMProviderChoice[];
  key: LLMKeyStatus;
  chatgpt: LLMOauthProviderStatus & { model?: string };
  grok: LLMOauthProviderStatus & { model?: string };
};

export type LLMModelList = {
  source: string;
  provider: string;
  models: string[];
  default: string;
};

export async function getLLMOauthStatus() {
  const response = await apiClient.get<ApiResponse<LLMOauthStatus>>("/ai/oauth");
  return response.data.data;
}

export async function startLLMOauth(provider: "chatgpt" | "grok") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/start`,
  );
  return response.data.data;
}

export async function cancelLLMOauth(provider: "chatgpt" | "grok") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/cancel`,
  );
  return response.data.data;
}

export async function logoutLLMOauth(provider: "chatgpt" | "grok") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/logout`,
  );
  return response.data.data;
}

export async function setLLMOauthAuth(auth: LLMAuthMode, model = "") {
  const response = await apiClient.put<ApiResponse<LLMOauthStatus>>("/ai/oauth", {
    auth,
    model,
  });
  return response.data.data;
}

export async function listLLMModels(payload: {
  source?: "key" | "chatgpt" | "grok";
  provider?: string;
  api_key?: string;
  base_url?: string;
}) {
  const response = await apiClient.post<ApiResponse<LLMModelList>>(
    "/ai/oauth/models",
    payload,
  );
  return response.data.data;
}

export type LLMApiKeyUpdate = {
  provider: string;
  api_key: string;
  base_url?: string;
  model?: string;
};

export async function saveLLMApiKey(payload: LLMApiKeyUpdate) {
  const response = await apiClient.put<ApiResponse<LLMOauthStatus>>(
    "/ai/oauth/key",
    payload,
  );
  return response.data.data;
}

export async function clearLLMApiKey() {
  const response = await apiClient.delete<ApiResponse<LLMOauthStatus>>(
    "/ai/oauth/key",
  );
  return response.data.data;
}

/** Visible reviews whose booking total is under `threshold`, cheapest first. */
export async function getLowValueReviews(
  threshold: number,
  page = 1,
  pageSize = 20,
) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<LowValueReview> & { threshold: number }>
  >("/admin/reviews/low-value", {
    params: { threshold, page, page_size: pageSize },
  });

  return response.data.data;
}

/** Hides every visible review whose booking total is under `threshold`. */
export async function hideLowValueReviews(threshold: number) {
  const response = await apiClient.post<
    ApiResponse<{ threshold: number; hidden: number; review_ids: number[] }>
  >("/admin/reviews/low-value/hide", { threshold }, { timeout: 60000 });

  return response.data.data;
}

/** Hidden reviews whose booking total is at or above `threshold`, dearest first. */
export async function getHiddenHighValueReviews(
  threshold: number,
  page = 1,
  pageSize = 20,
) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<LowValueReview> & { threshold: number }>
  >("/admin/reviews/high-value-hidden", {
    params: { threshold, page, page_size: pageSize },
  });

  return response.data.data;
}

/** Makes every hidden review at or above `threshold` visible again. */
export async function showHiddenHighValueReviews(threshold: number) {
  const response = await apiClient.post<
    ApiResponse<{ threshold: number; restored: number; review_ids: number[] }>
  >("/admin/reviews/high-value-hidden/show", { threshold }, { timeout: 60000 });

  return response.data.data;
}
