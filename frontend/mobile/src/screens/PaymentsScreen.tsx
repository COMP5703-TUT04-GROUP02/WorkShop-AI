import { getCurrentLanguage } from "../i18n/language";
import { translateText } from "../i18n/translations";
import { useLanguage } from "../i18n/LanguageContext";
import { T } from "../i18n/T";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { getCustomerPayments } from "../api/customer";
import { getProviderPayments } from "../api/provider";
import { MarketplaceBreakdownCard } from "../components/MarketplaceBreakdownCard";
import { SecondaryButton } from "../components/SecondaryButton";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme/theme";
import type { PaymentHistoryEntry } from "../types/booking";
import {
  getBookingStatusLabel,
  getPaymentStatusLabel,
} from "../constants/labels";
import { formatDateTime } from "../utils/datetime";
import { getErrorMessage } from "../utils/errors";
import { createLatestRequestGuard } from "../utils/latestRequest";
import { formatMoney } from "../utils/money";
import { getPaymentStatusTone } from "../utils/payment";

const PAGE_SIZE = 20;

/**
 * WS-110. History only: what was charged, for which booking, and when.
 *
 * There is deliberately no stored-card list. The demo has no payment-method
 * vault, so offering to "manage cards" would be a control that cannot work.
 */
export function PaymentsScreen() {
  useLanguage();
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const requestGuard = useRef(createLatestRequestGuard());

  const isProvider = user?.role === "provider";
  const accountKey = user ? `${user.id}:${user.role}` : null;

  useEffect(() => {
    requestGuard.current.invalidate();
    setPayments([]);
    setPage(1);
    setTotalPages(1);
    setMessage("");
  }, [accountKey]);

  const loadPayments = useCallback(async () => {
    const request = requestGuard.current.begin();
    if (!user || user.role === "admin") {
      setPayments([]);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setMessage("");
    let isMovingToLastPage = false;
    try {
      const result = isProvider
        ? await getProviderPayments(page, PAGE_SIZE)
        : await getCustomerPayments(page, PAGE_SIZE);

      if (!requestGuard.current.isLatest(request)) return;
      const availablePages = Math.max(1, result?.total_pages ?? 1);
      setTotalPages(availablePages);
      if (page > availablePages) {
        isMovingToLastPage = true;
        setPage(availablePages);
        return;
      }
      setPayments(result?.items ?? []);
    } catch (error) {
      if (requestGuard.current.isLatest(request)) {
        setPayments([]);
        setMessage(getErrorMessage(error));
      }
    } finally {
      if (requestGuard.current.isLatest(request) && !isMovingToLastPage) {
        setIsLoading(false);
      }
    }
  }, [isProvider, page, user]);

  useFocusEffect(
    useCallback(() => {
      void loadPayments();
      return () => requestGuard.current.invalidate();
    }, [loadPayments]),
  );

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.header}>
        <T style={styles.title}>Payments</T>
        <SecondaryButton
          disabled={isLoading}
          label="Refresh"
          onPress={() => void loadPayments()}
        />
      </View>

      <Text style={styles.subtitle}>
        {isProvider
          ? translateText(getCurrentLanguage(), "Payments customers have made for your bookings.")
          : translateText(getCurrentLanguage(), "What you have paid, and for which booking.")}
      </Text>

      {message ? <T style={styles.message}>{message}</T> : null}

      {isLoading ? (
        <ActivityIndicator accessibilityLabel={translateText(getCurrentLanguage(), "Loading payments")} color={colors.primary} />
      ) : payments.length > 0 ? (
        payments.map((payment) => (
          <PaymentRow key={payment.id} isProvider={isProvider} payment={payment} />
        ))
      ) : !message ? (
        <View style={styles.emptyCard}>
          <T style={styles.emptyTitle}>No payments yet</T>
          <Text style={styles.emptyBody}>
            {isProvider
              ? translateText(getCurrentLanguage(), "Payments appear here once a customer pays for a booking.")
              : translateText(getCurrentLanguage(), "Once you pay for a booking it shows up here.")}
          </Text>
        </View>
      ) : null}

      {payments.length > 0 || totalPages > 1 ? (
        <View style={styles.pagination}>
          <SecondaryButton
            disabled={isLoading || page <= 1}
            label="Previous"
            onPress={() => setPage((current) => Math.max(1, current - 1))}
            style={styles.pageButton}
          />
          <Text style={styles.pageLabel}>Page {page} of {totalPages}</Text>
          <SecondaryButton
            disabled={isLoading || page >= totalPages}
            label="Next"
            onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
            style={styles.pageButton}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function PaymentRow({
  isProvider,
  payment,
}: {
  isProvider: boolean;
  payment: PaymentHistoryEntry;
}) {
  const counterparty = isProvider
    ? payment.booking?.customer?.name
    : payment.booking?.provider?.business_name;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.amount}>{formatMoney(payment.amount)}</Text>
        <StatusPill status={payment.status} />
      </View>

      <Text style={styles.cardLine} numberOfLines={2}>
        {payment.booking?.service_description ?? `Booking #${payment.booking_id}`}
        {counterparty ? ` · ${counterparty}` : ""}
      </Text>

      <View style={styles.stateRow}>
        <T style={styles.stateLabel}>Payment</T>
        <Text style={styles.stateValue}>{getPaymentStatusLabel(payment.status)}</Text>
      </View>
      {payment.booking?.status ? (
        <View style={styles.stateRow}>
          <T style={styles.stateLabel}>Booking</T>
          <Text style={styles.stateValue}>
            {getBookingStatusLabel(payment.booking.status)}
          </Text>
        </View>
      ) : null}

      <Text style={styles.cardMeta}>
        {payment.paid_at
          ? `Paid ${formatDateTime(payment.paid_at)}`
          : `Created ${formatDateTime(payment.created_at)}`}
        {payment.refunded_at
          ? ` · Refunded ${formatDateTime(payment.refunded_at)}`
          : ""}
      </Text>
      {isProvider ? (
        <MarketplaceBreakdownCard payment={payment} />
      ) : null}
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const paymentTone = getPaymentStatusTone(status);
  const tone =
    paymentTone === "success"
      ? styles.pillPaid
      : paymentTone === "muted"
        ? styles.pillRefunded
        : paymentTone === "danger"
          ? styles.pillFailed
          : styles.pillPending;

  return (
    <View style={[styles.pill, tone]}>
      <Text style={styles.pillText}>{getPaymentStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
  },
  message: {
    color: colors.danger,
    fontSize: 14,
  },
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  amount: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  cardLine: {
    color: colors.text,
    fontSize: 15,
  },
  stateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stateLabel: {
    color: colors.mutedText,
    fontSize: 13,
  },
  stateValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  cardMeta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  pill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillPaid: {
    backgroundColor: "#E7F6F0",
  },
  pillRefunded: {
    backgroundColor: "#FDEEEE",
  },
  pillPending: {
    backgroundColor: colors.border,
  },
  pillFailed: {
    backgroundColor: "#FDEEEE",
  },
  pillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  emptyCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyBody: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  pagination: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  pageButton: {
    minWidth: 100,
  },
  pageLabel: {
    color: colors.mutedText,
    fontSize: 14,
  },
});
