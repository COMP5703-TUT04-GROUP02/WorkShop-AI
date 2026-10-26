import { Pressable, StyleSheet, Text, View } from "react-native";

import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import { colors, spacing, type } from "../theme/theme";
import type { BookingDetail } from "../types/booking";
import { formatDateTime, formatDateTimeRange } from "../utils/datetime";

export function BookingCoreDetails({
  booking,
  onOpenProvider,
  role,
  includeLifecycleDates = false,
}: {
  booking: BookingDetail;
  onOpenProvider?: (booking: BookingDetail) => void;
  role: "customer" | "provider";
  includeLifecycleDates?: boolean;
}) {
  const participantLabel = role === "customer" ? "Provider" : "Customer";
  const participantValue =
    role === "customer"
      ? booking.provider?.business_name || `Provider #${booking.provider_profile_id}`
      : booking.customer?.name || `Customer #${booking.customer_id}`;

  return (
    <View style={styles.container}>
      <Row label={participantLabel}>
        {role === "customer" && onOpenProvider ? (
          <Pressable
            accessibilityHint="Opens the provider profile"
            accessibilityLabel={`Open ${participantValue}`}
            accessibilityRole="link"
            onPress={() => onOpenProvider(booking)}
          >
            <Text style={[styles.value, styles.link]}>{participantValue}</Text>
          </Pressable>
        ) : (
          <Text style={styles.value}>{participantValue}</Text>
        )}
      </Row>
      <Row label="Booking title" value={booking.title} />
      <Row label="Service description" value={booking.service_description} />
      <Row label="Service address" value={booking.service_address} />
      <Row
        label="Scheduled time"
        value={formatDateTimeRange(
          booking.scheduled_start_time,
          booking.scheduled_end_time,
        )}
      />
      {includeLifecycleDates ? (
        <>
          <Row label="Booked at" value={formatDateTime(booking.booking_at)} />
          <Row
            label="Completed at"
            value={booking.completed_at ? formatDateTime(booking.completed_at) : "—"}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * One fact about the booking.
 *
 * Stacked on a phone, where there is no room for two columns. On a wider
 * screen the label sits in its own column so the values line up and the list
 * can be read down rather than zig-zagged through.
 */
export function Row({
  children,
  label,
  value,
}: {
  children?: React.ReactNode;
  label: string;
  value?: string;
}) {
  const isWide = useIsWebDesktop();

  return (
    <View style={[styles.row, isWide ? styles.rowWide : null]}>
      <Text style={[styles.label, isWide ? styles.labelWide : null]}>
        {label}
      </Text>
      <View style={isWide ? styles.valueColumn : null}>
        {children || <Text style={styles.value}>{value || "—"}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
  rowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: 5,
  },
  label: {
    color: colors.mutedText,
    fontSize: type.secondary,
    fontWeight: "600",
  },
  // Wide enough for the longest label the booking rows use, so every value
  // starts on the same line.
  labelWide: {
    width: 168,
    flexShrink: 0,
    paddingTop: 2,
  },
  valueColumn: {
    flex: 1,
    minWidth: 0,
  },
  value: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
  },
  link: {
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
