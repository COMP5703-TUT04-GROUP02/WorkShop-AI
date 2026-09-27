import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Platform,
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
  getCustomerPayments,
  payCustomerBooking,
  rejectCustomerBookingQuote,
  requestCustomerRefund,
} from "../../api/customer";
import { CustomerReviewModal } from "../../components/CustomerReviewModal";
import { CompletionProofGallery } from "../../components/CompletionProofGallery";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import type { RootStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../theme/theme";
import type {
  BookingActionResponseData,
  BookingDetail,
  PaymentSummary,
  RefundServiceStage,
} from "../../types/booking";
import { getPaymentStatusLabel } from "../../constants/labels";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney, formatPayLabel } from "../../utils/money";
import {
  createPaymentIdempotencyKey,
  getPaymentAction,
  getPaymentStatusTone,
  shouldRotatePaymentIdempotencyKey,
} from "../../utils/payment";

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
  const navigation = useNavigation<
    NativeStackNavigationProp<RootStackParamList>
  >();
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [paymentsByBookingId, setPaymentsByBookingId] = useState<
    Record<number, PaymentSummary>
  >({});
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const paymentInFlightRef = useRef(false);
  const paymentIdempotencyKeysRef = useRef<Record<number, string>>({});
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
      const [result, paymentResult] = await Promise.all([
        getCustomerBookings(undefined, 1, 100),
        getCustomerPayments(1, 100),
      ]);
      const payments = paymentResult?.items ?? [];
      payments.forEach((payment) => {
        if (shouldRotatePaymentIdempotencyKey(payment)) {
          delete paymentIdempotencyKeysRef.current[payment.booking_id];
        }
      });
      setBookings(filterActiveBookings(result?.items ?? []));
      setPaymentsByBookingId(indexLatestPayments(payments));
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialBookings() {
      setIsLoading(true);
      try {
        const [result, paymentResult] = await Promise.all([
          getCustomerBookings(undefined, 1, 100),
          getCustomerPayments(1, 100),
        ]);
        if (isActive) {
          const payments = paymentResult?.items ?? [];
          payments.forEach((payment) => {
            if (shouldRotatePaymentIdempotencyKey(payment)) {
              delete paymentIdempotencyKeysRef.current[payment.booking_id];
            }
          });
          setBookings(filterActiveBookings(result?.items ?? []));
          setPaymentsByBookingId(indexLatestPayments(payments));
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

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        previousState.match(/inactive|background/) &&
        nextState === "active"
      ) {
        void loadBookings();
      }
      previousState = nextState;
    });

    return () => subscription.remove();
  }, [loadBookings]);

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
    action: () => Promise<BookingActionResponseData | null | undefined>,
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
    if (paymentInFlightRef.current) {
      return;
    }

    paymentInFlightRef.current = true;
    setIsActing(true);
    setActionError("");
    try {
      const idempotencyKey =
        paymentIdempotencyKeysRef.current[booking.id] ??
        (paymentIdempotencyKeysRef.current[booking.id] =
          createPaymentIdempotencyKey());
      const result = await payCustomerBooking(
        booking.id,
        "iyzico_checkout",
        idempotencyKey,
      );
      const payment = result?.payment;
      if (result?.booking) {
        setSelectedBooking(result.booking);
      }
      if (payment) {
        setPaymentsByBookingId((current) => ({
          ...current,
          [payment.booking_id]: payment,
        }));
      }

      if (shouldRotatePaymentIdempotencyKey(payment)) {
        delete paymentIdempotencyKeysRef.current[booking.id];
      }

      if (result?.payment_page_url) {
        delete paymentIdempotencyKeysRef.current[booking.id];
        await Linking.openURL(result.payment_page_url);
        setMessage("iyzico checkout opened. Return here after payment to refresh the status.");
        void loadBookings();
      } else if (payment?.status) {
        setMessage(`Payment status: ${getPaymentStatusLabel(payment.status)}.`);
      } else {
        setMessage("Payment checkout is being prepared. Refresh this page shortly.");
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      paymentInFlightRef.current = false;
      setIsActing(false);
    }
  }

  function openProvider(booking: BookingDetail) {
    if (Platform.OS === "web") {
      closeBooking();
    }
    navigation.navigate("CustomerProviderDetail", {
      providerId: booking.provider_profile_id,
    });
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
              payment={paymentsByBookingId[booking.id]}
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
        payment={selectedBooking ? paymentsByBookingId[selectedBooking.id] : null}
        isActing={isActing}
        onAcceptQuote={handleAcceptQuote}
        onAppealRefund={handleAppealRefund}
        onCancel={handleCancelBooking}
        onCancelRefund={handleCancelRefund}
        onClose={closeBooking}
        onConfirmComplete={handleConfirmComplete}
        onPay={handlePayBooking}
        onOpenProvider={openProvider}
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
  payment,
  onAcceptQuote,
  onCancel,
  onConfirmComplete,
  onOpen,
  onPay,
  onRequestRefund,
}: {
  booking: BookingDetail;
  disabled: boolean;
  payment?: PaymentSummary | null;
  onAcceptQuote: (booking: BookingDetail) => void;
  onCancel: (booking: BookingDetail) => void;
  onConfirmComplete: (booking: BookingDetail) => void;
  onOpen: (booking: BookingDetail) => void;
  onPay: (booking: BookingDetail) => void;
  onRequestRefund: (booking: BookingDetail) => void;
}) {
  const paymentAction = getPaymentAction(booking.status, payment);
  const canPay = paymentAction === "pay" || paymentAction === "continue";
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
          <Text style={styles.cardTitle}>{booking.title || `Booking #${booking.id}`}</Text>
          <Text style={styles.providerName}>
            {booking.provider?.business_name || `Provider #${booking.provider_profile_id}`}
          </Text>
        </View>
        <View style={styles.statusStack}>
          <Text style={[styles.statusBadge, getStatusBadgeStyle(booking.status)]}>
            {getBookingStatusLabel(booking.status)}
          </Text>
          {payment ? (
            <Text
              style={[
                styles.statusBadge,
                getPaymentBadgeStyle(payment.status),
              ]}
            >
              {getPaymentStatusLabel(payment.status)}
            </Text>
          ) : null}
        </View>
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
              label={
                paymentAction === "continue"
                  ? "Continue payment"
                  : formatPayLabel(booking.quote_amount)
              }
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
  payment,
  isActing,
  onAcceptQuote,
  onAppealRefund,
  onCancel,
  onCancelRefund,
  onClose,
  onConfirmComplete,
  onPay,
  onOpenProvider,
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
  payment?: PaymentSummary | null;
  isActing: boolean;
  onAcceptQuote: (booking: BookingDetail) => void;
  onAppealRefund: (booking: BookingDetail) => void;
  onCancel: (booking: BookingDetail) => void;
  onCancelRefund: (booking: BookingDetail) => void;
  onClose: () => void;
  onConfirmComplete: (booking: BookingDetail) => void;
  onPay: (booking: BookingDetail) => void;
  onOpenProvider: (booking: BookingDetail) => void;
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
  const paymentAction = getPaymentAction(booking.status, payment);
  const canPay = paymentAction === "pay" || paymentAction === "continue";
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
              label="Payment status"
              value={payment ? getPaymentStatusLabel(payment.status) : "Not started"}
            />
            {payment?.failure_message ? (
              <DetailRow label="Payment note" value={payment.failure_message} />
            ) : null}
            <DetailRow label="Booking title" value={booking.title} />
            <DetailRow
              label="Provider"
              onPress={() => onOpenProvider(booking)}
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
                {paymentAction === "continue"
                  ? "Your iyzico checkout is ready. Continue payment to complete this booking."
                  : `iyzico Sandbox will charge ${formatMoney(booking.quote_amount)} after you complete checkout.`}
              </Text>
            ) : null}

            <CompletionProofGallery booking={booking} />

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
                label={
                  paymentAction === "continue"
                    ? "Continue payment"
                    : formatPayLabel(booking.quote_amount)
                }
                onPress={() => onPay(booking)}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress?: () => void;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {onPress ? (
        <Pressable
          accessibilityHint="Opens the provider profile"
          accessibilityLabel={`Open ${value}`}
          accessibilityRole="link"
          onPress={onPress}
        >
          <Text style={[styles.detailValue, styles.detailLink]}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={styles.detailValue}>{value}</Text>
      )}
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

function indexLatestPayments(payments: PaymentSummary[]) {
  return payments.reduce<Record<number, PaymentSummary>>((indexed, payment) => {
    const existing = indexed[payment.booking_id];
    if (
      !existing ||
      new Date(payment.created_at).getTime() > new Date(existing.created_at).getTime()
    ) {
      indexed[payment.booking_id] = payment;
    }
    return indexed;
  }, {});
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

function getPaymentBadgeStyle(status: string) {
  const tone = getPaymentStatusTone(status);
  if (tone === "success") {
    return styles.statusSuccess;
  }
  if (tone === "danger") {
    return styles.statusDanger;
  }
  if (tone === "muted") {
    return styles.statusMuted;
  }
  return styles.statusWarning;
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
  statusStack: {
    alignItems: "flex-end",
    gap: spacing.xs,
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
  statusDanger: {
    backgroundColor: "#FEF2F2",
    color: colors.danger,
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
  detailLink: {
    color: colors.primary,
    textDecorationLine: "underline",
    fontWeight: "700",
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
