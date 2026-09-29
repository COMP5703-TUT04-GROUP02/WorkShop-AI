import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import type { PaymentHistoryEntry, PaymentSummary } from "../types/booking";
import { getMarketplaceBreakdown } from "../utils/marketplace";
import { formatMoney } from "../utils/money";

export function MarketplaceBreakdownCard({
  amount,
  payment,
  title = "Marketplace split",
}: {
  amount?: number | string | null;
  payment?: PaymentSummary | PaymentHistoryEntry | null;
  title?: string;
}) {
  const breakdown = getMarketplaceBreakdown(payment, amount);
  if (!breakdown) {
    return null;
  }

  const settlement = payment?.settlement;
  const payoutLabel = breakdown.providerPayout != null
    ? "Expected settlement from iyzico"
    : "Expected payout (estimate)";

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Row label="Platform commission" value={formatMoney(breakdown.platformCommission)} />
      <Row label="Provider share" value={formatMoney(breakdown.providerShare)} />
      <Row
        label={`iyzico fee${breakdown.feeIsEstimated ? " (estimate)" : ""}`}
        value={formatMoney(breakdown.iyzicoFee)}
      />
      <Row
        label="KDV/VAT reference"
        value={`${(breakdown.vatRate * 100).toFixed(0)}%`}
      />
      <Row
        label={payoutLabel}
        value={formatMoney(breakdown.providerPayout ?? breakdown.providerShare)}
      />
      {settlement ? (
        <Row label="Settlement" value={formatSettlementStatus(settlement.status)} />
      ) : (
        <Text style={styles.note}>Estimate until the payment is captured.</Text>
      )}
      <Text style={styles.note}>KDV/VAT is a reference rate and is not deducted here.</Text>
      {settlement?.failure_message ? (
        <Text style={styles.error}>{settlement.failure_message}</Text>
      ) : null}
      {settlement?.provider_recovery_amount != null ? (
        <Row
          label="Recovery"
          value={`${formatMoney(settlement.provider_recovery_amount)} · ${settlement.recovery_status || "Pending"}`}
        />
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function formatSettlementStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
  },
  value: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  note: {
    color: colors.mutedText,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
