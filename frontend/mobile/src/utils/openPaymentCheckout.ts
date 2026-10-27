import { Linking, Platform } from "react-native";

export async function openPaymentCheckout(paymentPageUrl: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(paymentPageUrl);
    return;
  }

  await Linking.openURL(paymentPageUrl);
}
