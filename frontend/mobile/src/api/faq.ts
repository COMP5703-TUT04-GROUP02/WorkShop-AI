import { apiClient } from "./client";
import type { ApiResponse } from "../types/auth";
import type { FaqCategory, FaqResponse } from "../types/faq";
import type { AppLanguage } from "../i18n/language";

export async function getCustomerFaq(language: AppLanguage = "en"): Promise<FaqCategory[]> {
  const response = await apiClient.get<ApiResponse<FaqResponse>>("/faq", {
    params: { audience: "customer", language },
  });

  const categories = response.data.data?.categories;
  if (!Array.isArray(categories)) {
    throw new Error("Help articles returned an invalid response.");
  }

  return categories;
}
