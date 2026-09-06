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
  acceptCustomerBookingQuote,
  appealCustomerRefund,
  cancelCustomerBooking,
  cancelCustomerRefund,
  confirmCustomerBookingComplete,
  createCustomerReview,
  getCustomerBookings,
  payCustomerBooking,
  rejectCustomerBookingQuote,
  requestCustomerRefund,
} from "../../api/customer";
import { CustomerReviewModal } from "../../components/CustomerReviewModal";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type { BookingDetail, RefundServiceStage } from "../../types/booking";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney, formatPayLabel } from "../../utils/money";

const CANCELLABLE_STATUSES = ["pending", "quoted", "awaiting_payment"];
const HIDDEN_ORDER_STATUSES = ["completed", "cancelled", "rejected", "refunded"];
const REFUND_SERVICE_STAGES: Array<{
  label: string;
  value: RefundServiceStage;
}> = [
  { label: "Not started", value: "not_started" },
  { label: "In progress", value: "in_progress" },
  { label: "Service completed", value: "service_completed" },
];

export function CustomerBookingsScreen() {
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [refundServiceStage, setRefundServiceStage] =
    useState<RefundServiceStage>("in_progress");
  const [refundReason, setRefundReason] = useState("");
  const [refundAppealReason, setRefundAppealReason] = useState("");
  const [reviewBooking, setReviewBooking] = useState<BookingDetail | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const loadBookings = useCallback(async () => {
    setMessage("");
    try {
      const result = await getCustomerBookings(undefined, 1, 100);
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
        const result = await getCustomerBookings(undefined, 1, 100);
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
    setRejectReason("");
    setRefundServiceStage(getDefaultRefundServiceStage(booking.status));
    setRefundReason("");
    setRefundAppealReason("");
    setActionError("");
  }

  function closeBooking() {
    setSelectedBooking(null);
    setRejectReason("");
    setRefundServiceStage("in_progress");
    setRefundReason("");
    setRefundAppealReason("");
    setActionError("");
  }

  function openRefundForm(booking: BookingDetail) {
    openBooking(booking);
    setActionError("Select the service stage and enter a refund reason.");
  }

  async function runBookingAction(
    action: () => Promise<{ booking?: BookingDetail } | null | undefined>,
    successMessage: string,
  ) {
    setIsActing(true);
    setActionError("");
    try {
      const result = await action();
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      await loadBookings();
      Alert.alert("Success", successMessage);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handleAcceptQuote(booking: BookingDetail) {
    await runBookingAction(
      () => acceptCustomerBookingQuote(booking.id),
      "Quote accepted. Payment is due.",
    );
  }

  async function handleRejectQuote(booking: BookingDetail) {
    const reason = rejectReason.trim();
    if (!reason) {
      setActionError("Enter a reason for declining the quote.");
      return;
    }

    await runBookingAction(
      () => rejectCustomerBookingQuote(booking.id, reason),
      "Quote declined. The provider can send a new quote.",
    );
  }

  async function handlePayBooking(booking: BookingDetail) {
    await runBookingAction(
      () => payCustomerBooking(booking.id),
      "Payment successful. The booking is in progress.",
    );
  }

  async function handleCancelBooking(booking: BookingDetail) {
    await runBookingAction(
      () => cancelCustomerBooking(booking.id),
      "Booking cancelled.",
    );
  }

  async function handleRequestRefund(booking: BookingDetail) {
    const reason = refundReason.trim();
    if (!reason) {
      setActionError("Enter a refund reason.");
      return;
    }

    await runBookingAction(
      () => requestCustomerRefund(booking.id, refundServiceStage, reason),
      "Refund request sent.",
    );
  }

  async function handleCancelRefund(booking: BookingDetail) {
    const refundRequestId = booking.current_refund_request?.id;
    if (!refundRequestId) {
      setActionError("This refund request cannot be cancelled.");
      return;
    }

    await runBookingAction(
      () => cancelCustomerRefund(refundRequestId),
      "Refund request cancelled.",
    );
  }

  async function handleAppealRefund(booking: BookingDetail) {
    const refundRequestId = booking.current_refund_request?.id;
    const reason = refundAppealReason.trim();
    if (!refundRequestId) {
      setActionError("This refund cannot be appealed.");
      return;
    }
    if (!reason) {
      setActionError("Enter an appeal reason.");
      return;
    }

    await runBookingAction(
      () => appealCustomerRefund(refundRequestId, reason),
      "Appeal submitted.",
    );
  }

  async function handleConfirmComplete(booking: BookingDetail) {
    setIsActing(true);
    setActionError("");
    try {
      const result = await confirmCustomerBookingComplete(booking.id);
      setSelectedBooking(null);
      await loadBookings();
      setReviewError("");
      setReviewBooking(
        result?.booking ?? {
          ...booking,
          status: "completed",
        },
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function handleSubmitReview(rating: number, comment: string) {
    if (!reviewBooking) {
      return;
    }

    setIsSubmittingReview(true);
    setReviewError("");
    try {
      await createCustomerReview(reviewBooking.id, rating, comment);
      setReviewBooking(null);
      Alert.alert("Review submitted", "Thank you for your feedback.");
    } catch (error) {
      setReviewError(getErrorMessage(error));
    } finally {
      setIsSubmittingReview(false);
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
            <BookingCard
              booking={booking}
              disabled={isActing}
              key={booking.id}
              onAcceptQuote={handleAcceptQuote}
        onCancel={handleCancelBooking}
        onConfirmComplete={handleConfirmComplete}
        onOpen={openBooking}
        onPay={handlePayBooking}
        onRequestRefund={openRefundForm}
            />
          ))}
        </View>
      )}

      <BookingDetailModal
        actionError={actionError}
        booking={selectedBooking}
        isActing={isActing}
        onAcceptQuote={handleAcceptQuote}
        onAppealRefund={handleAppealRefund}
        onCancel={handleCancelBooking}
        onCancelRefund={handleCancelRefund}
        onClose={closeBooking}
        onConfirmComplete={handleConfirmComplete}
        onPay={handlePayBooking}
        onRejectQuote={handleRejectQuote}
        onRequestRefund={handleRequestRefund}
        refundAppealReason={refundAppealReason}
        refundReason={refundReason}
        refundServiceStage={refundServiceStage}
        rejectReason={rejectReason}
        setRefundAppealReason={setRefundAppealReason}
        setRefundReason={setRefundReason}
        setRefundServiceStage={setRefundServiceStage}
        setRejectReason={setRejectReason}
      />

      <CustomerReviewModal
        booking={reviewBooking}
        errorMessage={reviewError}
        isSubmitting={isSubmittingReview}
        onClose={() => setReviewBooking(null)}
        onSubmit={(rating, comment) => void handleSubmitReview(rating, comment)}
      />
    </ScrollView>
  );
}

function BookingCard({
  booking,
  disabled,
  onAcceptQuote,
  onCancel,
  onConfirmComplete,
  onOpen,
  onPay,
  onRequestRefund,
}: {
  booking: BookingDetail;
  disabled: boolean;
  onAcceptQuote: (booking: BookingDetail) => void;
  onCancel: (booking: BookingDetail) => void;
  onConfirmComplete: (booking: BookingDetail) => void;
  onOpen: (booking: BookingDetail) => void;
  onPay: (booking: BookingDetail) => void;
  onRequestRefund: (booking: BookingDetail) => void;
}) {
  const canPay = booking.status === "awaiting_payment";
  const canAcceptQuote = booking.status === "quoted";
  const canCancel = CANCELLABLE_STATUSES.includes(String(booking.status));
  const canRequestRefund = ["accepted", "awaiting_confirmation"].includes(
    String(booking.status),
  );
  const canConfirmComplete = booking.status === "awaiting_confirmation";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(booking)}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.cardTitle}>Booking #{booking.id}</Text>
          <Text style={styles.providerName}>
            {booking.provider?.business_name || `Provider #${booking.provider_profile_id}`}
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
        {booking.quote_amount == null ? "Awaiting quote" : formatMoney(booking.quote_amount)}
      </Text>
      {booking.current_refund_request ? (
        <Text style={styles.refundText}>
          Refund: {getRefundStatusLabel(booking.current_refund_request.status)}
        </Text>
      ) : null}

      {canAcceptQuote || canPay || canCancel || canRequestRefund || canConfirmComplete ? (
        <View style={styles.cardActions}>
          {canCancel ? (
            <SecondaryButton
              disabled={disabled}
              label="Cancel booking"
              onPress={() => onCancel(booking)}
            />
          ) : null}
          {canAcceptQuote ? (
            <PrimaryButton
              disabled={disabled}
              label="Accept quote"
              onPress={() => onAcceptQuote(booking)}
            />
          ) : null}
          {canConfirmComplete ? (
            <PrimaryButton
              disabled={disabled}
              label="Confirm complete"
              onPress={() => onConfirmComplete(booking)}
            />
          ) : null}
          {canRequestRefund ? (
            <SecondaryButton
              disabled={disabled}
              label="Request refund"
              onPress={() => onRequestRefund(booking)}
            />
          ) : null}
          {canPay ? (
            <PrimaryButton
              disabled={disabled}
              label={formatPayLabel(booking.quote_amount)}
              onPress={() => onPay(booking)}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function BookingDetailModal({
  actionError,
  booking,
  isActing,
  onAcceptQuote,
  onAppealRefund,
  onCancel,
  onCancelRefund,
  onClose,
  onConfirmComplete,
  onPay,
  onRejectQuote,
  onRequestRefund,
  refundAppealReason,
  refundReason,
  refundServiceStage,
  rejectReason,
  setRefundAppealReason,
  setRefundReason,
  setRefundServiceStage,
  setRejectReason,
}: {
  actionError: string;
  booking: BookingDetail | null;
  isActing: boolean;
  onAcceptQuote: (booking: BookingDetail) => void;
  onAppealRefund: (booking: BookingDetail) => void;
  onCancel: (booking: BookingDetail) => void;
  onCancelRefund: (booking: BookingDetail) => void;
  onClose: () => void;
  onConfirmComplete: (booking: BookingDetail) => void;
  onPay: (booking: BookingDetail) => void;
  onRejectQuote: (booking: BookingDetail) => void;
  onRequestRefund: (booking: BookingDetail) => void;
  refundAppealReason: string;
  refundReason: string;
  refundServiceStage: RefundServiceStage;
  rejectReason: string;
  setRefundAppealReason: (value: string) => void;
  setRefundReason: (value: string) => void;
  setRefundServiceStage: (value: RefundServiceStage) => void;
  setRejectReason: (value: string) => void;
}) {
  if (!booking) {
    return null;
  }

  const canRejectQuote = booking.status === "quoted";
  const canAcceptQuote = booking.status === "quoted";
  const canPay = booking.status === "awaiting_payment";
  const canCancel = CANCELLABLE_STATUSES.includes(String(booking.status));
  const canRequestRefund = ["accepted", "awaiting_confirmation"].includes(
    String(booking.status),
  );
  const canConfirmComplete = booking.status === "awaiting_confirmation";
  const canCancelRefund =
    booking.status === "refunding" &&
    ["pending", "rejected"].includes(
      String(booking.current_refund_request?.status || ""),
    );
  const canAppealRefund =
    booking.status === "refunding" &&
    booking.current_refund_request?.status === "rejected";

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Booking #{booking.id}</Text>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <DetailRow label="Status" value={getBookingStatusLabel(booking.status)} />
            <DetailRow
              label="Provider"
              value={
                booking.provider?.business_name || `Provider #${booking.provider_profile_id}`
              }
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
            {booking.current_refund_request ? (
              <>
                <DetailRow
                  label="Refund status"
                  value={getRefundStatusLabel(booking.current_refund_request.status)}
                />
                <DetailRow
                  label="Refund stage"
                  value={getRefundServiceStageLabel(
                    booking.current_refund_request.service_stage,
                  )}
                />
                <DetailRow
                  label="Refund reason"
                  value={booking.current_refund_request.reason}
                />
                <DetailRow
                  label="Provider response"
                  value={booking.current_refund_request.provider_note || "—"}
                />
                <DetailRow
                  label="Support response"
                  value={booking.current_refund_request.admin_note || "—"}
                />
                <DetailRow
                  label="Appeal reason"
                  value={booking.current_refund_request.appeal_reason || "—"}
                />
              </>
            ) : null}

            {canRejectQuote ? (
              <TextField
                label="Decline reason"
                multiline
                numberOfLines={3}
                onChangeText={setRejectReason}
                placeholder="e.g. Price is too high"
                value={rejectReason}
              />
            ) : null}

            {canPay ? (
              <Text style={styles.payHint}>
                This demo charges {formatMoney(booking.quote_amount)} automatically.
              </Text>
            ) : null}

            {canRequestRefund ? (
              <>
                <View style={styles.stageBox}>
                  <Text style={styles.detailLabel}>Refund stage</Text>
                  <View style={styles.stageOptions}>
                    {REFUND_SERVICE_STAGES.map((stage) => (
                      <Pressable
                        accessibilityRole="button"
                        key={stage.value}
                        onPress={() => setRefundServiceStage(stage.value)}
                        style={[
                          styles.stageButton,
                          refundServiceStage === stage.value
                            ? styles.stageButtonActive
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stageButtonText,
                            refundServiceStage === stage.value
                              ? styles.stageButtonTextActive
                              : null,
                          ]}
                        >
                          {stage.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <TextField
                  label="Refund reason"
                  multiline
                  numberOfLines={3}
                  onChangeText={setRefundReason}
                  placeholder="Reason for refund"
                  value={refundReason}
                />
              </>
            ) : null}

            {canAppealRefund ? (
              <TextField
                label="Appeal reason"
                multiline
                numberOfLines={3}
                onChangeText={setRefundAppealReason}
                  placeholder="Reason for appeal"
                value={refundAppealReason}
              />
            ) : null}

          </ScrollView>

          {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isActing} label="Close" onPress={onClose} />
            {canCancel ? (
              <SecondaryButton
                disabled={isActing}
                label="Cancel booking"
                onPress={() => onCancel(booking)}
              />
            ) : null}
            {canRejectQuote ? (
              <SecondaryButton
                disabled={isActing}
                label="Decline quote"
                onPress={() => onRejectQuote(booking)}
              />
            ) : null}
            {canAcceptQuote ? (
              <PrimaryButton
                disabled={isActing}
                isLoading={isActing}
                label="Accept quote"
                onPress={() => onAcceptQuote(booking)}
              />
            ) : null}
            {canConfirmComplete ? (
              <PrimaryButton
                disabled={isActing}
                isLoading={isActing}
                label="Confirm complete"
                onPress={() => onConfirmComplete(booking)}
              />
            ) : null}
            {canRequestRefund ? (
              <SecondaryButton
                disabled={isActing}
                label="Request refund"
                onPress={() => onRequestRefund(booking)}
              />
            ) : null}
            {canCancelRefund ? (
              <SecondaryButton
                disabled={isActing}
                label="Cancel refund"
                onPress={() => onCancelRefund(booking)}
              />
            ) : null}
            {canAppealRefund ? (
              <PrimaryButton
                disabled={isActing}
                isLoading={isActing}
                label="Submit appeal"
                onPress={() => onAppealRefund(booking)}
              />
            ) : null}
            {canPay ? (
              <PrimaryButton
                disabled={isActing}
                isLoading={isActing}
                label={formatPayLabel(booking.quote_amount)}
                onPress={() => onPay(booking)}
              />
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
    pending: "Pending review",
    quoted: "Quote awaiting confirmation",
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

function getDefaultRefundServiceStage(status: string): RefundServiceStage {
  if (status === "awaiting_confirmation") {
    return "service_completed";
  }

  return "in_progress";
}

function filterActiveBookings(bookings: BookingDetail[]) {
  return bookings.filter(
    (booking) => !HIDDEN_ORDER_STATUSES.includes(String(booking.status)),
  );
}

function getStatusBadgeStyle(status: string) {
  if (status === "awaiting_payment") {
    return styles.statusWarning;
  }
  if (status === "accepted" || status === "completed") {
    return styles.statusSuccess;
  }
  if (status === "cancelled" || status === "rejected" || status === "refunded") {
    return styles.statusMuted;
  }
  return styles.statusNeutral;
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
  payHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  actionErrorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
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
  providerName: {
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
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  stageBox: {
    gap: spacing.sm,
  },
  stageOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  stageButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stageButtonActive: {
    borderColor: colors.primary,
    backgroundColor: "#ECFDF3",
  },
  stageButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  stageButtonTextActive: {
    color: colors.primary,
  },
});
