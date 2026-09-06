import axios from "axios";

import { API_BASE_URL } from "../config/env";

let accessToken: string | null = null;

// All HTTP requests go through here for auth, error handling, and response unwrapping.
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}
