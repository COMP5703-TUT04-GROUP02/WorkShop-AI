import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../theme/theme";
import type { BookingDetail } from "../types/booking";

export function BookingContextInformation({
  booking,
}: {
  booking: BookingDetail;
}) {
  const isInitialQuoteNegotiation = ["pending", "quoted"].includes(
    String(booking.status),
  );
  const initialDeclineReason = isInitialQuoteNegotiation
    ? booking.last_declined_quote?.decline_reason
    : null;
  const finalDeclineReason =
    booking.status === "awaiting_final_quote"
      ? booking.final_quote_decline_reason
      : null;

  if (!initialDeclineReason && !finalDeclineReason) {
    return null;
  }

  return (
    <View style={styles.container}>
      {initialDeclineReason ? (
        <ContextRow
          label="Customer decline reason"
          value={initialDeclineReason}
        />
      ) : null}
      {finalDeclineReason ? (
        <ContextRow
          label="Customer final quote decline reason"
          value={finalDeclineReason}
        />
      ) : null}
    </View>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  value: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
