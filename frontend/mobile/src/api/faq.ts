import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { FaqCategory, FaqResponse } from "../types/faq";

export async function getCustomerFaq(): Promise<FaqCategory[]> {
  const response = await apiClient.get<ApiResponse<FaqResponse>>("/faq", {
    params: { audience: "customer" },
  });

  const categories = response.data.data?.categories;
  if (!Array.isArray(categories)) {
    throw new Error("Help articles returned an invalid response.");
  }

  return categories;
}
