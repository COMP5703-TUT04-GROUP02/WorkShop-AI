import { Platform } from "react-native";

const FORWARDED_API_URL = "http://127.0.0.1:8020";
const LAN_API_URL = "http://10.10.10.10:8020";

function resolveApiBaseUrl() {
  if (Platform.OS === "web") {
    return process.env.EXPO_PUBLIC_API_BASE_URL ?? FORWARDED_API_URL;
  }

  return process.env.EXPO_PUBLIC_LAN_API_BASE_URL ?? LAN_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const WS_BASE_URL =
  process.env.EXPO_PUBLIC_WS_BASE_URL ??
  API_BASE_URL.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");

export const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
