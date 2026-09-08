import { Platform } from "react-native";

const FORWARDED_API_URL = "http://127.0.0.1:8020";
const LAN_API_URL = "http://10.10.10.10:8020";

function isSameOrigin(value?: string) {
  return value === "same-origin";
}

function resolveApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (isSameOrigin(configured)) {
    return "";
  }

  if (Platform.OS === "web") {
    return configured ?? FORWARDED_API_URL;
  }

  return process.env.EXPO_PUBLIC_LAN_API_BASE_URL ?? LAN_API_URL;
}

function resolveWsBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_WS_BASE_URL;
  if (isSameOrigin(configured) || (!configured && API_BASE_URL === "")) {
    if (typeof window === "undefined") {
      return "";
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  if (configured) {
    return configured;
  }

  return API_BASE_URL.replace(/^http:\/\//, "ws://").replace(
    /^https:\/\//,
    "wss://",
  );
}

export const API_BASE_URL = resolveApiBaseUrl();

export const WS_BASE_URL = resolveWsBaseUrl();

export const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
