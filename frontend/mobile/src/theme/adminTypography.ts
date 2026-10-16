import type { TextStyle } from "react-native";

// Admin content only. Keep the app's native/system font family and shared controls.
// Choose by semantic role, not the name of a component's local style key.
export const adminTypography = {
  pageTitle: { fontSize: 28, fontWeight: "800", lineHeight: 36 },
  modalTitle: { fontSize: 22, fontWeight: "800", lineHeight: 30 },
  sectionTitle: { fontSize: 18, fontWeight: "700", lineHeight: 26 },
  cardTitle: { fontSize: 16, fontWeight: "700", lineHeight: 24 },
  body: { fontSize: 14, fontWeight: "400", lineHeight: 21 },
  label: { fontSize: 14, fontWeight: "600", lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: "400", lineHeight: 19 },
  badge: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  metric: { fontSize: 24, fontWeight: "800", lineHeight: 32 },
  code: { fontSize: 28, fontWeight: "800", lineHeight: 36, letterSpacing: 2 },
} satisfies Record<string, TextStyle>;
