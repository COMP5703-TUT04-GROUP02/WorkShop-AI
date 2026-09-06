import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { RefundRequestSummary } from "../types/booking";
import type { PaginatedData } from "../types/chat";
import type { ProviderPortfolio, ProviderProfile } from "../types/provider";

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

export async function getPendingProviderPortfolios(page = 1, pageSize = 20) {
  const response = await apiClient.get<ApiResponse<PaginatedData<ProviderPortfolio>>>(
    "/admin/provider-portfolios",
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

export async function getPendingRefundAppeals(page = 1, pageSize = 20) {
  const response = await apiClient.get<
    ApiResponse<PaginatedData<RefundRequestSummary>>
  >("/admin/refund-requests", {
    params: {
      status: "appealed",
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

export type LLMAuthMode = "key" | "chatgpt";

export type LLMOauthProviderStatus = {
  connected: boolean;
  pending: boolean;
  status: string;
  user_code?: string;
  url?: string;
  error?: string;
  note?: string;
};

export type LLMOauthStatus = {
  auth: LLMAuthMode;
  saved_auth: LLMAuthMode;
  llm_provider: string;
  chatgpt: LLMOauthProviderStatus;
};

export async function getLLMOauthStatus() {
  const response = await apiClient.get<ApiResponse<LLMOauthStatus>>("/ai/oauth");
  return response.data.data;
}

export async function startLLMOauth(provider: "chatgpt") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/start`,
  );
  return response.data.data;
}

export async function cancelLLMOauth(provider: "chatgpt") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/cancel`,
  );
  return response.data.data;
}

export async function logoutLLMOauth(provider: "chatgpt") {
  const response = await apiClient.post<ApiResponse<LLMOauthStatus>>(
    `/ai/oauth/${provider}/logout`,
  );
  return response.data.data;
}

export async function setLLMOauthAuth(auth: LLMAuthMode) {
  const response = await apiClient.put<ApiResponse<LLMOauthStatus>>("/ai/oauth", {
    auth,
  });
  return response.data.data;
}
