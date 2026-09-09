import { Platform } from "react-native";

import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { BookingActionResponseData, BookingDetail } from "../types/booking";
import type { PaginatedData } from "../types/chat";
import type {
  ProviderAvailability,
  ProviderAvailabilityOverride,
  ProviderAvailabilityResponseData,
  ProviderAvailabilityUpdateResponseData,
  ProviderContactProfilePatchPayload,
  ProviderContactProfilePayload,
  ProviderContactProfileUpdateResponse,
  ProviderPortfolio,
  ProviderProfileMutationResponse,
  ProviderProfilePayload,
  ProviderProfile,
} from "../types/provider";
import type { Review } from "../types/review";

export async function getProviderProfile() {
  const response =
    await apiClient.get<ApiResponse<ProviderProfile>>("/provider/profile");

  return response.data.data;
}

export async function createProviderProfile(payload: ProviderProfilePayload) {
  const response = await apiClient.post<
    ApiResponse<ProviderProfileMutationResponse>
  >("/provider/profile", payload);

  return response.data.data;
}

export async function updateProviderProfile(payload: ProviderProfilePayload) {
  const response = await apiClient.put<
    ApiResponse<ProviderProfileMutationResponse>
  >("/provider/profile", payload);

  return response.data.data;
}

export async function uploadProviderCertificates(
  files: Array<{
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  }>,
) {
  const formData = new FormData();

  for (const file of files) {
    const fileName = file.fileName || "certificate.jpg";
    const mimeType = file.mimeType || "application/octet-stream";

    if (Platform.OS === "web") {
      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();
      const uploadFile = new File([blob], fileName, {
        type: mimeType || blob.type || "application/octet-stream",
      });
      formData.append("files", uploadFile);
    } else {
      formData.append("files", {
        uri: file.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }
  }

  const response = await apiClient.post<
    ApiResponse<{
      files: Array<{
        original_file_name: string;
        file_name: string;
        file_url: string;
        content_type: string;
        media_type: "image" | "video" | "document" | string;
        size: number;
      }>;
    }>
  >("/provider/certificates/upload", formData, {
    timeout: 120000,
  });

  return response.data.data;
}

export async function updateProviderContactProfile(
  payload: ProviderContactProfilePayload,
) {
  const response = await apiClient.put<
    ApiResponse<ProviderContactProfileUpdateResponse>
  >("/provider/profile/contact", payload);

  return response.data.data;
}

export async function patchProviderContactProfile(
  payload: ProviderContactProfilePatchPayload,
) {
  const response = await apiClient.patch<
    ApiResponse<ProviderContactProfileUpdateResponse>
  >("/provider/profile/contact", payload);

  return response.data.data;
}

export async function getProviderAvailability() {
  const response = await apiClient.get<ApiResponse<ProviderAvailabilityResponseData>>(
    "/provider/availability",
  );

  return response.data.data;
}

export async function updateProviderAvailability(
  availabilities: Array<
    Pick<ProviderAvailability, "weekday" | "start_time" | "end_time" | "is_available">
  >,
) {
  const response =
    await apiClient.put<ApiResponse<ProviderAvailabilityUpdateResponseData>>(
      "/provider/availability",
      {
        availabilities,
      },
    );

  return response.data.data;
}

export async function getProviderAvailabilityOverrides(month: string) {
  const response = await apiClient.get<
    ApiResponse<ProviderAvailabilityOverride[]>
  >("/provider/availability/overrides", {
    params: {
      month,
    },
  });

  return response.data.data;
}

export async function updateProviderAvailabilityOverride(
  overrideDate: string,
  payload: {
    start_time: string | null;
    end_time: string | null;
    is_available: boolean;
  },
) {
  const response = await apiClient.put<ApiResponse<ProviderAvailabilityOverride>>(
    `/provider/availability/overrides/${overrideDate}`,
    payload,
  );

  return response.data.data;
}

export async function deleteProviderAvailabilityOverride(overrideDate: string) {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/provider/availability/overrides/${overrideDate}`,
  );

  return response.data.data;
}

export async function getProviderPortfolios(page = 1, pageSize = 20) {
  const response = await apiClient.get<ApiResponse<PaginatedData<ProviderPortfolio>>>(
    "/provider/portfolio",
    {
      params: {
        page,
        page_size: pageSize,
      },
    },
  );

  return response.data.data;
}

export async function getProviderPortfolioItem(portfolioId: number) {
  const response = await apiClient.get<ApiResponse<ProviderPortfolio>>(
    `/provider/portfolio/${portfolioId}`,
  );

  return response.data.data;
}

export async function createProviderPortfolio(payload: {
  title: string;
  description?: string | null;
  mediaFiles: Array<{
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  }>;
}) {
  const formData = new FormData();

  formData.append("title", payload.title);
  if (payload.description) {
    formData.append("description", payload.description);
  }

  for (const mediaFile of payload.mediaFiles) {
    const fileName = mediaFile.fileName || "portfolio.jpg";
    const mimeType = mediaFile.mimeType || "image/jpeg";

    if (Platform.OS === "web") {
      const fileResponse = await fetch(mediaFile.uri);
      const blob = await fileResponse.blob();
      const file = new File([blob], fileName, {
        type: mimeType || blob.type || "application/octet-stream",
      });

      formData.append("media_files", file);
    } else {
      formData.append("media_files", {
        uri: mediaFile.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }
  }

  const response = await apiClient.post<ApiResponse<ProviderPortfolio>>(
    "/provider/portfolio",
    formData,
    {
      timeout: 120000,
    },
  );

  return response.data.data;
}

export async function getProviderReviews(page = 1, pageSize = 10) {
  const response = await apiClient.get<ApiResponse<PaginatedData<Review>>>(
    "/provider/reviews",
    {
      params: {
        page,
        page_size: pageSize,
      },
    },
  );

  return response.data.data;
}

export async function getProviderScheduleBookings(month: string) {
  const response = await apiClient.get<ApiResponse<BookingDetail[]>>(
    "/provider/bookings/schedule",
    {
      params: {
        month,
      },
    },
  );

  return response.data.data;
}

export async function getProviderBookings(status?: string, page = 1, pageSize = 50) {
  const response = await apiClient.get<ApiResponse<PaginatedData<BookingDetail>>>(
    "/provider/bookings",
    {
      params: {
        status: status || undefined,
        page,
        page_size: pageSize,
      },
    },
  );

  return response.data.data;
}

export async function quoteProviderBooking(
  bookingId: number,
  quoteAmount: number,
  quoteMessage: string | null,
) {
  const response = await apiClient.put<ApiResponse<BookingActionResponseData>>(
    `/provider/bookings/${bookingId}/quote`,
    {
      quote_amount: quoteAmount,
      quote_message: quoteMessage,
    },
  );

  return response.data.data;
}

export async function rejectProviderBooking(
  bookingId: number,
  statusNote: string,
) {
  const response = await apiClient.put<ApiResponse<BookingActionResponseData>>(
    `/provider/bookings/${bookingId}/reject`,
    {
      status_note: statusNote,
    },
  );

  return response.data.data;
}

export async function completeProviderBooking(
  bookingId: number,
  proofFiles: Array<{
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  }>,
) {
  const formData = new FormData();

  for (const proofFile of proofFiles) {
    const fileName = proofFile.fileName || "completion-proof.jpg";
    const mimeType = proofFile.mimeType || "image/jpeg";

    if (Platform.OS === "web") {
      const fileResponse = await fetch(proofFile.uri);
      const blob = await fileResponse.blob();
      const file = new File([blob], fileName, {
        type: mimeType || blob.type || "application/octet-stream",
      });

      formData.append("proof_files", file);
    } else {
      formData.append("proof_files", {
        uri: proofFile.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }
  }

  const response = await apiClient.put<ApiResponse<BookingActionResponseData>>(
    `/provider/bookings/${bookingId}/complete`,
    formData,
    {
      timeout: 120000,
    },
  );

  return response.data.data;
}

export async function approveProviderRefundRequest(refundRequestId: number) {
  const response = await apiClient.put<ApiResponse<BookingActionResponseData>>(
    `/provider/refund-requests/${refundRequestId}/approve`,
    undefined,
    {
      timeout: 30000,
    },
  );

  return response.data.data;
}

export async function rejectProviderRefundRequest(
  refundRequestId: number,
  providerNote: string,
) {
  const response = await apiClient.put<ApiResponse<BookingActionResponseData>>(
    `/provider/refund-requests/${refundRequestId}/reject`,
    {
      provider_note: providerNote,
    },
    {
      timeout: 30000,
    },
  );

  return response.data.data;
}
