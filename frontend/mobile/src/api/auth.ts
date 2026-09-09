import { Platform } from "react-native";

import { apiClient, setSessionTokens } from "./client";
import type {
  ApiResponse,
  RegisterRequest,
  TokenResponse,
  User,
  UserProfilePatchPayload,
} from "../types/auth";

function unwrapData<T>(response: { data: ApiResponse<T> }) {
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.message || "Request failed");
  }

  return response.data.data;
}

export async function loginWithPassword(email: string, password: string) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await apiClient.post<ApiResponse<TokenResponse>>(
    "/login",
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  const data = unwrapData(response);
  setSessionTokens(data.access_token, data.refresh_token);

  return data;
}

export async function registerUser(payload: RegisterRequest) {
  await apiClient.post("/register", payload);

  return loginWithPassword(payload.email, payload.password);
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await apiClient.post<ApiResponse<TokenResponse>>("/refresh-token", {
    refresh_token: refreshToken,
  });
  const data = unwrapData(response);
  setSessionTokens(data.access_token, data.refresh_token);

  return data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<ApiResponse<User>>("/me");

  return unwrapData(response);
}

export async function updateCurrentUser(payload: { name: string }) {
  const response = await apiClient.put<ApiResponse<User>>("/me", payload);

  return unwrapData(response);
}

export async function patchCurrentUser(payload: UserProfilePatchPayload) {
  const response = await apiClient.patch<ApiResponse<User>>("/me", payload);

  return unwrapData(response);
}

export async function uploadCurrentUserAvatar(payload: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  const formData = new FormData();
  const fileName = payload.fileName || "avatar.jpg";
  const mimeType = payload.mimeType || "image/jpeg";

  if (Platform.OS === "web") {
    const fileResponse = await fetch(payload.uri);
    const blob = await fileResponse.blob();
    const file = new File([blob], fileName, {
      type: mimeType || blob.type || "image/jpeg",
    });

    formData.append("file", file);
  } else {
    formData.append("file", {
      uri: payload.uri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  }

  const response = await apiClient.post<
    ApiResponse<{
      original_file_name: string;
      file_name: string;
      file_url: string;
      content_type: string;
      size: number;
      user: User;
    }>
  >("/me/avatar", formData);

  return unwrapData(response);
}

export async function logoutByRefreshToken(refreshToken: string) {
  await apiClient.post("/logout", {
    refresh_token: refreshToken,
  });
  setSessionTokens(null, null);
}
