import { getCurrentLanguage } from "../i18n/language";
import { translateText } from "../i18n/translations";
import { useLanguage } from "../i18n/LanguageContext";
import { T } from "../i18n/T";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { getCustomerBookings, getCustomerPayments } from "../api/customer";
import { HelpLink } from "../components/HelpLink";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { getBookingStatusLabel, getPaymentStatusLabel } from "../constants/labels";
import { colors, radius, spacing } from "../theme/theme";
import type { RootStackParamList } from "../navigation/types";
import type { BookingDetail, PaymentSummary } from "../types/booking";
import { getErrorMessage } from "../utils/errors";
import { formatMoney } from "../utils/money";
import {
  savePendingPaymentResult,
} from "../utils/pendingPaymentResult";
import { useAuth } from "../context/AuthContext";

type PaymentResultScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "PaymentResult"
>;

export function PaymentResultScreen({
  navigation,
  route,
}: PaymentResultScreenProps) {
  useLanguage();
  const { user } = useAuth();
  const bookingId = Number(route.params?.booking_id);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadResult = useCallback(async () => {
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      setMessage("The payment result is missing its booking reference.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const [bookingPage, paymentPage] = await Promise.all([
        getCustomerBookings(undefined, 1, 100),
        getCustomerPayments(1, 100),
      ]);
      const nextBooking =
        bookingPage?.items?.find((item) => item.id === bookingId) ?? null;
      const nextPayment =
        paymentPage?.items
          ?.filter((item) => item.booking_id === bookingId)
          .sort((left, right) =>
            right.created_at.localeCompare(left.created_at),
          )[0] ?? null;

      setBooking(nextBooking);
      setPayment(nextPayment);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!user) {
      void savePendingPaymentResult(route.params);
      setIsLoading(false);
      return;
    }

    void loadResult();
  }, [loadResult, route.params, user]);

  const isPaid = payment?.status === "paid";
  const isAuthorized = payment?.status === "authorized";
  const isProcessing = payment?.status === "processing";
  const isRefunded =
    payment?.status === "refunded" || payment?.status === "partially_refunded";
  const isFailed =
    payment?.status === "failed" || payment?.status === "capture_failed";
  const isVoided = payment?.status === "voided";

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.content} style={styles.container}>
        <View style={styles.card}>
          <T style={styles.eyebrow}>Payment result</T>
          <T style={styles.title}>Payment callback received</T>
          <T style={styles.body}>
            Sign in to view the latest booking and payment status. Your payment
            result reference will be kept and reopened after sign-in.
          </T>
          <View style={styles.actions}>
            <PrimaryButton
              label="Sign in"
              onPress={() => navigation.navigate("Auth")}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.card}>
        <T style={styles.eyebrow}>Payment result</T>
        <Text style={styles.title}>
          {isLoading
            ? translateText(getCurrentLanguage(), "Checking payment")
            : isPaid
              ? translateText(getCurrentLanguage(), "Payment successful")
              : isAuthorized
                ? translateText(getCurrentLanguage(), "Payment authorized")
                : isProcessing
                  ? translateText(getCurrentLanguage(), "Payment processing")
                  : isRefunded
                    ? translateText(getCurrentLanguage(), "Payment refunded")
                    : isVoided
                      ? translateText(getCurrentLanguage(), "Authorization released")
                      : isFailed
                        ? translateText(getCurrentLanguage(), "Payment failed")
                        : translateText(getCurrentLanguage(), "Payment not completed")}
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : message ? (
          <T style={styles.errorText}>{message}</T>
        ) : (
          <>
            <Text style={styles.body}>
              {isPaid
                ? translateText(getCurrentLanguage(), "Your payment was successful. Check the booking status below for the next step.")
                : isAuthorized
                  ? translateText(getCurrentLanguage(), "Your payment method was authorized. The final charge will be captured after service completion.")
                  : isProcessing
                    ? translateText(getCurrentLanguage(), "Your payment is still being processed. Do not start another checkout until the result is confirmed.")
                    : isRefunded
                      ? payment?.status === "partially_refunded"
                        ? translateText(getCurrentLanguage(), "Part of this payment was refunded.")
                        : translateText(getCurrentLanguage(), "This payment was refunded.")
                      : isVoided
                        ? translateText(getCurrentLanguage(), "The payment authorization was released and no charge was captured.")
                        : isFailed
                          ? translateText(getCurrentLanguage(), "The payment was not completed. You can try checkout again from the booking page.")
                          : translateText(getCurrentLanguage(), "The booking is still awaiting payment. You can try checkout again from the booking page.")}
            </Text>
            <DetailRow label="Booking" value={`#${bookingId}`} />
            <DetailRow
              label="Booking status"
              value={booking ? getBookingStatusLabel(booking.status) : "Unavailable"}
            />
            <DetailRow
              label="Payment status"
              value={payment ? getPaymentStatusLabel(payment.status) : "Unavailable"}
            />
            {payment?.amount != null ? (
              <DetailRow label="Amount" value={formatMoney(payment.amount)} />
            ) : null}
            {payment?.failure_message ? (
              <Text style={styles.errorText}>{payment.failure_message}</Text>
            ) : null}
            {!isPaid && !isAuthorized && !isProcessing && !isRefunded && !isVoided ? (
              <HelpLink faqId="CUST-PAY-007" label="Payment not going through?" />
            ) : null}
          </>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            label="Back to bookings"
            onPress={() =>
              navigation.navigate("Main", { screen: "CustomerBookings" })
            }
          />
          <SecondaryButton
            disabled={isLoading}
            label="Refresh result"
            onPress={() => void loadResult()}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <T style={styles.detailLabel}>{label}</T>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    alignSelf: "center",
    gap: spacing.md,
    maxWidth: 560,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  body: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  detailRow: {
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
