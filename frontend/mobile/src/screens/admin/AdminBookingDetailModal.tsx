import { X } from "lucide-react-native";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BookingAttachmentGallery } from "../../components/BookingAttachmentGallery";
import { SecondaryButton } from "../../components/SecondaryButton";
import { getBookingStatusLabel } from "../../constants/labels";
import { colors, radius, spacing } from "../../theme/theme";
import { adminTypography as type } from "../../theme/adminTypography";
import type { AdminBookingDetail, AdminBookingRecord } from "../../types/adminBooking";
import { formatMoney } from "../../utils/money";
import { bookingStatusStyle, formatBookingDateTime } from "./bookingPresentation";

const BOOKING_GROUPS = [
  ["Booking overview", ["id", "title", "status", "status_note", "booking_notice", "chat_room_id", "closed_reason"]],
  ["Service and location", ["service_category", "service_description", "service_address", "service_latitude", "service_longitude", "customer_current_address", "customer_current_latitude", "customer_current_longitude"]],
  ["Schedule and lifecycle", ["booking_at", "scheduled_start_time", "scheduled_end_time", "completed_at", "arrival_started_at", "quoted_at", "final_quote_declined_at", "final_quote_confirmed_at"]],
  ["Pricing and current quote", ["total_amount", "expected_service_amount", "visit_fee_amount", "quote_amount", "quote_message", "final_quote_amount", "final_quote_message", "final_quote_decline_reason", "current_quote_revision_id"]],
  ["Booking availability", ["onboarding_paused", "onboarding_pause_reason", "onboarding_paused_at"]],
] as const;

const LABELS: Record<string, string> = {
  id: "Booking ID", customer_id: "Customer user ID", provider_profile_id: "Provider profile ID",
  chat_room_id: "Chat room ID", title: "Booking title", booking_at: "Booked at", total_amount: "Booking total",
  expected_service_amount: "Expected service amount", quote_amount: "Quote amount", visit_fee_amount: "Visit fee",
  final_quote_amount: "Final quote amount", current_quote_revision_id: "Current quote revision ID",
  customer_current_address: "Customer location at booking", customer_current_latitude: "Customer latitude at booking",
  customer_current_longitude: "Customer longitude at booking", onboarding_paused: "Temporarily paused",
  onboarding_pause_reason: "Pause reason", onboarding_paused_at: "Paused at", is_visible: "Visible",
};

function labelFor(key: string) {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, value => value.toUpperCase()).replace(/\bid\b/g, "ID");
}

export function bookingValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status") return String(value).replace(/_/g, " ");
  if (key === "is_visible" || key === "onboarding_paused" || typeof value === "boolean") return value ? "Yes" : "No";
  if (key.endsWith("_at") || key === "scheduled_start_time" || key === "scheduled_end_time") return formatBookingDateTime(String(value));
  if (key.endsWith("_amount") || key === "amount" || key === "iyzico_commission_fee") return formatMoney(value as number);
  return String(value);
}

function Row({ label, value, status }: { label: string; value: string; status?: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={[styles.value, status ? { color: bookingStatusStyle(status).color } : null]}>{value}</Text></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Fields({ record, currency }: { record: AdminBookingRecord; currency?: string }) {
  return <>{Object.entries(record).map(([key, value]) => <Row key={key}
    label={key === "id" ? "Record ID" : key === "total_amount" ? "Quote total" : labelFor(key)}
    value={currency && (key.endsWith("_amount") || key === "amount" || key === "iyzico_commission_fee") && value != null
      ? `${Number(value).toFixed(2)} ${currency}` : bookingValue(key, value)} />)}</>;
}

function Records({ title, records }: { title: string; records: AdminBookingRecord[] }) {
  return <Section title={`${title} (${records.length})`}>
    {records.length ? records.map((record, index) => <View style={styles.record} key={String(record.id ?? index)}><Fields record={record} /></View>)
      : <Text style={styles.muted}>No records</Text>}
  </Section>;
}

export function AdminBookingDetailModal({ bookingId, booking, loading, error, onClose, onRetry }: {
  bookingId: number; booking: AdminBookingDetail | null; loading: boolean; error: string;
  onClose: () => void; onRetry: () => void;
}) {
  return <Modal animationType="slide" transparent visible onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.header}>
          <View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>Booking #{bookingId}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close booking details" onPress={onClose} style={styles.close}><X size={22} color={colors.text} /></Pressable>
        </View>
        {loading ? <ActivityIndicator accessibilityLabel="Loading booking details" color={colors.primary} />
          : error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><SecondaryButton label="Retry loading details" onPress={onRetry} /></View>
          : booking ? <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
            {BOOKING_GROUPS.map(([title, keys]) => <Section title={title} key={title}>
              {keys.map(key => <Row key={key} label={labelFor(key)} status={key === "status" ? booking.status : undefined} value={key === "status" ? getBookingStatusLabel(booking.status) : bookingValue(key, booking[key])} />)}
            </Section>)}
            <Section title="Customer and provider">
              <Row label="Customer user ID" value={`#${booking.customer_id}`} />
              <Row label="Customer name" value={booking.customer?.name || "—"} />
              <Row label="Customer email" value={booking.customer?.email || "—"} />
              <Row label="Provider profile ID" value={`#${booking.provider_profile_id}`} />
              <Row label="Provider user ID" value={booking.provider ? `#${booking.provider.user_id}` : "—"} />
              <Row label="Business name" value={booking.provider?.business_name || "—"} />
              <Row label="Provider phone" value={booking.provider?.phone_number || "—"} />
              <Row label="Provider address" value={booking.provider?.address || "—"} />
            </Section>
            <Records title="Quote revisions" records={booking.quote_revisions} />
            <Section title={`Payments (${booking.payments.length})`}>
              {!booking.payments.length ? <Text style={styles.muted}>No records</Text> : null}
              {booking.payments.map(({ settlement, ...payment }) => <View style={styles.record} key={payment.id}>
                <Text style={styles.recordTitle}>Payment #{payment.id}</Text>
                <Fields record={payment as AdminBookingRecord} currency={String(payment.currency)} />
                <Text style={styles.recordTitle}>Settlement</Text>
                {settlement ? <Fields record={settlement} currency={String(payment.currency)} /> : <Text style={styles.muted}>No settlement record</Text>}
              </View>)}
            </Section>
            <Records title="Refund requests" records={booking.refund_requests} />
            <Section title={`Attachments (${booking.attachments?.length ?? 0})`}>
              {!booking.attachments?.length ? <Text style={styles.muted}>No attachments</Text> : null}
              {booking.attachments?.map(attachment => <View style={styles.record} key={attachment.id}>
                <BookingAttachmentGallery attachments={[attachment]} title={`${attachment.purpose.replace(/_/g, " ")}${attachment.quote_revision_id ? ` · Quote revision ID #${attachment.quote_revision_id}` : ""}`} />
                <Row label="Attachment ID" value={`#${attachment.id}`} />
                <Row label="Uploaded by user ID" value={`#${attachment.uploaded_by_user_id}`} />
                <Row label="Type / size" value={`${attachment.content_type} · ${attachment.size} bytes`} />
                <Row label="Uploaded at" value={bookingValue("created_at", attachment.created_at)} />
              </View>)}
            </Section>
            <Records title="Status history" records={booking.status_history} />
            <Section title="Complaints summary">
              <Row label="Open complaints" value={String(booking.complaint_summary.open_complaint_count)} />
              <Row label="Total complaints" value={String(booking.complaint_summary.total_complaint_count)} />
            </Section>
            <Records title="Complaints" records={booking.complaints} />
            <Records title="Review" records={booking.reviews} />
          </ScrollView> : null}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.28)" },
  sheet: { height: "92%", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...type.modalTitle, color: colors.text },
  close: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  card: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  sectionTitle: { ...type.sectionTitle, color: colors.text },
  recordTitle: { ...type.cardTitle, color: colors.text },
  record: { gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: spacing.xs },
  label: { ...type.label, color: colors.mutedText, flexBasis: 180 },
  value: { ...type.body, flexBasis: 220, flexGrow: 1, flexShrink: 1, color: colors.text },
  muted: { ...type.caption, color: colors.mutedText },
  error: { ...type.body, color: colors.danger },
});
