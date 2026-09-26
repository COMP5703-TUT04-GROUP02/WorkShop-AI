import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  approveProviderRefundRequest,
  completeProviderBooking,
  getProviderBookings,
  quoteProviderBooking,
  rejectProviderRefundRequest,
  rejectProviderBooking,
} from "../../api/provider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type { BookingDetail } from "../../types/booking";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/money";

const HIDDEN_ORDER_STATUSES = ["completed", "cancelled", "rejected", "refunded"];

export function ProviderBookingsScreen() {
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [refundRejectReason, setRefundRejectReason] = useState("");
  const [proofAssets, setProofAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);

  const loadBookings = useCallback(async () => {
    setMessage("");
    try {
      const result = await getProviderBookings(undefined, 1, 100);
      setBookings(filterActiveBookings(result?.items ?? []));
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialBookings() {
      setIsLoading(true);
      try {
        const result = await getProviderBookings(undefined, 1, 100);
        if (isActive) {
          setBookings(filterActiveBookings(result?.items ?? []));
        }
      } catch (error) {
        if (isActive) {
          setMessage(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialBookings();

    return () => {
      isActive = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBookings();
    }, [loadBookings]),
  );

  function openBooking(booking: BookingDetail) {
    setSelectedBooking(booking);
    setQuoteAmount(booking.quote_amount == null ? "" : String(booking.quote_amount));
    setQuoteMessage(booking.quote_message || "");
    setRejectReason("");
    setRefundRejectReason("");
    setProofAssets([]);
    setActionError("");
  }

  function closeBooking() {
    setSelectedBooking(null);
    setQuoteAmount("");
    setQuoteMessage("");
    setRejectReason("");
    setRefundRejectReason("");
    setProofAssets([]);
    setActionError("");
  }

  async function handleQuoteBooking() {
    if (!selectedBooking) {
      return;
    }

    const amount = Number(quoteAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Enter a quote amount greater than 0.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await quoteProviderBooking(
        selectedBooking.id,
        amount,
        quoteMessage.trim() || null,
      );
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Quote sent", "The customer has been notified.");
      closeBooking();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handleRejectBooking() {
    if (!selectedBooking) {
      return;
    }

    const reason = rejectReason.trim();
    if (!reason) {
      setActionError("Enter a reason for declining this booking.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await rejectProviderBooking(selectedBooking.id, reason);
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Booking declined", "The customer has been notified.");
      closeBooking();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handlePickCompletionProof() {
    setActionError("");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setActionError("Allow access to photos to attach completion proof.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images", "videos"],
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setProofAssets(result.assets);
  }

  async function handleCompleteBooking() {
    if (!selectedBooking) {
      return;
    }
    if (proofAssets.length === 0) {
      setActionError("Add at least one photo or video as completion proof.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await completeProviderBooking(
        selectedBooking.id,
        proofAssets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        })),
      );
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Marked complete", "Waiting for the customer to confirm.");
      closeBooking();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handleApproveRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    if (!refundRequestId) {
      setActionError("No refund request to review.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await approveProviderRefundRequest(refundRequestId);
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Refund approved", "This booking is now closed.");
      closeBooking();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handleRejectRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    const reason = refundRejectReason.trim();
    if (!refundRequestId) {
      setActionError("No refund request to review.");
      return;
    }
    if (!reason) {
      setActionError("Enter a reason for declining the refund.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await rejectProviderRefundRequest(refundRequestId, reason);
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Refund declined", "The booking remains in refund review.");
      closeBooking();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
        <SecondaryButton
          disabled={isLoading || isActing}
          label="Refresh"
          onPress={() => void loadBookings()}
        />
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyText}>Active bookings appear here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {bookings.map((booking) => (
            <ProviderBookingCard
              booking={booking}
              key={booking.id}
              onOpen={openBooking}
            />
          ))}
        </View>
      )}

      <ProviderBookingDetailModal
        actionError={actionError}
        booking={selectedBooking}
        isActing={isActing}
        onClose={closeBooking}
        onApproveRefund={handleApproveRefund}
        onComplete={handleCompleteBooking}
        onPickCompletionProof={handlePickCompletionProof}
        onQuote={handleQuoteBooking}
        onReject={handleRejectBooking}
        onRejectRefund={handleRejectRefund}
        proofAssets={proofAssets}
        quoteAmount={quoteAmount}
        quoteMessage={quoteMessage}
        refundRejectReason={refundRejectReason}
        rejectReason={rejectReason}
        setRefundRejectReason={setRefundRejectReason}
        setQuoteAmount={setQuoteAmount}
        setQuoteMessage={setQuoteMessage}
        setRejectReason={setRejectReason}
      />
    </ScrollView>
  );
}

function ProviderBookingCard({
  booking,
  onOpen,
}: {
  booking: BookingDetail;
  onOpen: (booking: BookingDetail) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(booking)}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.cardTitle}>{booking.title || `Booking #${booking.id}`}</Text>
          <Text style={styles.customerName}>
            {booking.customer?.name || `Customer #${booking.customer_id}`}
          </Text>
        </View>
        <Text style={[styles.statusBadge, getStatusBadgeStyle(booking.status)]}>
          {getBookingStatusLabel(booking.status)}
        </Text>
      </View>

      <Text numberOfLines={2} style={styles.description}>
        {booking.service_description}
      </Text>
      <Text numberOfLines={1} style={styles.metaText}>
        {formatDateTime(booking.scheduled_start_time)} -{" "}
        {formatDateTime(booking.scheduled_end_time)}
      </Text>
      <Text numberOfLines={1} style={styles.metaText}>
        {booking.service_address}
      </Text>
      <Text style={styles.amountText}>
        {booking.quote_amount == null ? "No quote yet" : formatMoney(booking.quote_amount)}
      </Text>
      {booking.current_refund_request ? (
        <Text style={styles.refundText}>
          Refund: {getRefundStatusLabel(booking.current_refund_request.status)}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        <SecondaryButton label="View details" onPress={() => onOpen(booking)} />
      </View>
    </Pressable>
  );
}

function ProviderBookingDetailModal({
  actionError,
  booking,
  isActing,
  onApproveRefund,
  onComplete,
  onClose,
  onPickCompletionProof,
  onQuote,
  onReject,
  onRejectRefund,
  proofAssets,
  quoteAmount,
  quoteMessage,
  refundRejectReason,
  rejectReason,
  setRefundRejectReason,
  setQuoteAmount,
  setQuoteMessage,
  setRejectReason,
}: {
  actionError: string;
  booking: BookingDetail | null;
  isActing: boolean;
  onApproveRefund: () => void;
  onComplete: () => void;
  onClose: () => void;
  onPickCompletionProof: () => void;
  onQuote: () => void;
  onReject: () => void;
  onRejectRefund: () => void;
  proofAssets: ImagePicker.ImagePickerAsset[];
  quoteAmount: string;
  quoteMessage: string;
  refundRejectReason: string;
  rejectReason: string;
  setRefundRejectReason: (value: string) => void;
  setQuoteAmount: (value: string) => void;
  setQuoteMessage: (value: string) => void;
  setRejectReason: (value: string) => void;
}) {
  if (!booking) {
    return null;
  }

  const canRespond = booking.status === "pending";
  const canComplete = booking.status === "accepted";
  const currentRefundRequest = booking.current_refund_request;
  const canProcessRefund =
    booking.status === "refunding" && currentRefundRequest?.status === "pending";

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Booking #{booking.id}</Text>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <DetailRow label="Status" value={getBookingStatusLabel(booking.status)} />
            <DetailRow label="Booking title" value={booking.title} />
            <DetailRow
              label="Customer"
              value={booking.customer?.name || `Customer #${booking.customer_id}`}
            />
            <DetailRow label="Service description" value={booking.service_description} />
            <DetailRow label="Service address" value={booking.service_address} />
            <DetailRow
              label="Scheduled time"
              value={`${formatDateTime(booking.scheduled_start_time)} - ${formatDateTime(
                booking.scheduled_end_time,
              )}`}
            />
            <DetailRow
              label="Quote amount"
              value={
                booking.quote_amount == null ? "—" : formatMoney(booking.quote_amount)
              }
            />
            <DetailRow label="Quote notes" value={booking.quote_message || "—"} />
            <DetailRow label="Notes" value={booking.status_note || "—"} />
            {currentRefundRequest ? (
              <>
                <DetailRow
                  label="Refund status"
                  value={getRefundStatusLabel(currentRefundRequest.status)}
                />
                <DetailRow
                  label="Refund stage"
                  value={getRefundServiceStageLabel(currentRefundRequest.service_stage)}
                />
                <DetailRow label="Refund reason" value={currentRefundRequest.reason} />
                <DetailRow
                  label="Rejection note"
                  value={currentRefundRequest.provider_note || "—"}
                />
                <DetailRow
                  label="Appeal reason"
                  value={currentRefundRequest.appeal_reason || "—"}
                />
                <DetailRow
                  label="Support response"
                  value={currentRefundRequest.admin_note || "—"}
                />
              </>
            ) : null}

            {canRespond ? (
              <>
                <TextField
                  keyboardType="decimal-pad"
                  label="Quote amount"
                  onChangeText={setQuoteAmount}
                  placeholder="e.g. 120 TRY"
                  value={quoteAmount}
                />
                <TextField
                  label="Quote notes"
                  multiline
                  numberOfLines={2}
                  onChangeText={setQuoteMessage}
                  placeholder="Optional notes"
                  value={quoteMessage}
                />
                <TextField
                  label="Rejection reason"
                  multiline
                  numberOfLines={2}
                  onChangeText={setRejectReason}
                  placeholder="Required to decline this booking"
                  value={rejectReason}
                />
              </>
            ) : null}

            {canComplete ? (
              <View style={styles.proofBox}>
                <Text style={styles.detailLabel}>Completion proof</Text>
                <Text style={styles.proofText}>
                  {proofAssets.length > 0
                    ? `Selected ${proofAssets.length} files`
                    : "Add photos or video of the completed work"}
                </Text>
                {proofAssets.length > 0 ? (
                  <View style={styles.proofFileList}>
                    {proofAssets.map((asset, index) => (
                      <Text key={`${asset.uri}-${index}`} style={styles.proofFileText}>
                        {asset.fileName || `Completion proof ${index + 1}`}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <SecondaryButton
                  disabled={isActing}
                  label="Add proof"
                  onPress={onPickCompletionProof}
                />
              </View>
            ) : null}

            {canProcessRefund ? (
              <TextField
                label="Decline reason"
                multiline
                numberOfLines={3}
                onChangeText={setRefundRejectReason}
                placeholder="Required to decline this refund"
                value={refundRejectReason}
              />
            ) : null}

            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isActing} label="Close" onPress={onClose} />
            {canRespond ? (
              <>
                <SecondaryButton
                  disabled={isActing}
                  label="Decline booking"
                  onPress={onReject}
                />
                <PrimaryButton
                  disabled={isActing}
                  isLoading={isActing}
                  label="Send quote"
                  onPress={onQuote}
                />
              </>
            ) : null}
            {canComplete ? (
              <PrimaryButton
                disabled={isActing}
                isLoading={isActing}
                label="Mark complete"
                onPress={onComplete}
              />
            ) : null}
            {canProcessRefund ? (
              <>
                <SecondaryButton
                  disabled={isActing}
                  label="Reject refund"
                  onPress={onRejectRefund}
                />
                <PrimaryButton
                  disabled={isActing}
                  isLoading={isActing}
                  label="Approve refund"
                  onPress={onApproveRefund}
                />
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getBookingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    quoted: "Quoted",
    awaiting_payment: "Awaiting payment",
    accepted: "In progress",
    rejected: "Declined",
    refunding: "Refund in progress",
    refunded: "Refunded",
    awaiting_confirmation: "Awaiting confirmation",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || status;
}

function getRefundStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Declined",
    appealed: "Under review",
    admin_rejected: "Appeal declined",
    cancelled: "Cancelled",
  };

  return labels[status] || status;
}

function getRefundServiceStageLabel(stage: string) {
  const labels: Record<string, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    service_completed: "Service completed",
  };

  return labels[stage] || stage;
}

function getStatusBadgeStyle(status: string) {
  if (status === "pending") {
    return styles.statusWarning;
  }
  if (status === "quoted" || status === "awaiting_payment") {
    return styles.statusNeutral;
  }
  if (status === "accepted" || status === "completed") {
    return styles.statusSuccess;
  }
  if (status === "rejected" || status === "refunded") {
    return styles.statusMuted;
  }
  return styles.statusNeutral;
}

function filterActiveBookings(bookings: BookingDetail[]) {
  return bookings.filter(
    (booking) => !HIDDEN_ORDER_STATUSES.includes(String(booking.status)),
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontWeight: "800",
  },
  loadingBox: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  cardPressed: {
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  customerName: {
    color: colors.mutedText,
    fontSize: 14,
  },
  statusBadge: {
    overflow: "hidden",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 13,
    fontWeight: "700",
  },
  statusNeutral: {
    backgroundColor: "#EEF2FF",
    color: "#3730A3",
  },
  statusWarning: {
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
  },
  statusSuccess: {
    backgroundColor: "#ECFDF3",
    color: colors.primary,
  },
  statusMuted: {
    backgroundColor: colors.surface,
    color: colors.mutedText,
  },
  description: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  metaText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  amountText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  refundText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  modalCard: {
    maxHeight: "88%",
    gap: spacing.md,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  detailContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
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
    fontSize: 15,
    lineHeight: 22,
  },
  proofBox: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  proofText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  proofFileList: {
    gap: spacing.xs,
  },
  proofFileText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
