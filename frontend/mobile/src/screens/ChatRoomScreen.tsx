import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { CalendarClock, MapPin, Send, SendHorizontal } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buildChatWebSocketUrl,
  getBookingById,
  getChatMessages,
  sendChatMessage,
} from "../api/chat";
import { getAccessToken } from "../api/client";
import {
  acceptCustomerBookingQuote,
  appealCustomerRefund,
  cancelCustomerBooking,
  cancelCustomerRefund,
  confirmCustomerBookingComplete,
  createCustomerReview,
  createCustomerBooking,
  payCustomerBooking,
  rejectCustomerBookingQuote,
  requestCustomerRefund,
  updateCustomerPendingBooking,
} from "../api/customer";
import {
  approveProviderRefundRequest,
  completeProviderBooking,
  quoteProviderBooking,
  rejectProviderRefundRequest,
  rejectProviderBooking,
} from "../api/provider";
import {
  BookingRequestModal,
  buildBookingRequestPayload,
  createDefaultBookingRequestForm,
  type BookingRequestFormState,
} from "../components/BookingRequestModal";
import { CompletionProofGallery } from "../components/CompletionProofGallery";
import { CustomerReviewModal } from "../components/CustomerReviewModal";
import { DateTimeField } from "../components/DateTimeField";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { TextField } from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { colors, radius, spacing } from "../theme/theme";
import type {
  BookingDetail,
  BookingPayload,
} from "../types/booking";
import type { ChatMessage } from "../types/chat";
import { getErrorMessage } from "../utils/errors";
import { formatShortDateTime, toEditableDateTime } from "../utils/datetime";
import { formatMoney, formatPayLabel } from "../utils/money";
import {
  createPaymentIdempotencyKey,
  shouldRotatePaymentIdempotencyKey,
} from "../utils/payment";
import {
  getBookingStatusLabelForChat,
  getRefundStatusLabel,
} from "../constants/labels";

type ChatRoomScreenProps = NativeStackScreenProps<RootStackParamList, "ChatRoom">;

type ChatDisplayItem = {
  key: string;
  message: ChatMessage;
  variant: "message" | "booking" | "booking_update";
};

const CANCELLABLE_STATUSES = ["pending", "quoted", "awaiting_payment"];
const PINNED_BOOKING_HIDDEN_STATUSES = [
  "completed",
  "cancelled",
  "rejected",
  "refunded",
  "partially_refunded",
];
export function ChatRoomScreen({ navigation, route }: ChatRoomScreenProps) {
  const { user } = useAuth();
  const { markChatRoomRead } = useRealtime();
  const listRef = useRef<FlatList<ChatDisplayItem>>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingRequestFormState | null>(
    null,
  );
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [quoteRejectReason, setQuoteRejectReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAppealReason, setRefundAppealReason] = useState("");
  const [refundRejectReason, setRefundRejectReason] = useState("");
  const [proofAssets, setProofAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [finalQuoteAmount, setFinalQuoteAmount] = useState("");
  const [finalQuoteMessage, setFinalQuoteMessage] = useState("");
  const [bookingActionError, setBookingActionError] = useState("");
  const [reviewBooking, setReviewBooking] = useState<BookingDetail | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isBookingActionLoading, setIsBookingActionLoading] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const paymentInFlightRef = useRef(false);
  const paymentIdempotencyKeysRef = useRef<Record<number, string>>({});
  const [isCreateBookingModalVisible, setIsCreateBookingModalVisible] =
    useState(false);
  const [createBookingForm, setCreateBookingForm] =
    useState<BookingRequestFormState>(
      createDefaultBookingRequestForm(),
  );
  const [createBookingError, setCreateBookingError] = useState("");
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);

  const [opponentOnline, setOpponentOnline] = useState(
    Boolean(route.params.opponentOnline),
  );
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === "active",
  );

  useEffect(() => {
    markChatRoomRead(route.params.chatRoomId);
  }, [markChatRoomRead, route.params.chatRoomId]);

  const canCreateBooking =
    user?.role === "customer" && Boolean(route.params.providerProfileId);
  const displayMessages = useMemo(
    () => collapseBookingMessages(messages),
    [messages],
  );
  const pinnedBookingItem = useMemo(
    () => getLatestBookingCardItem(displayMessages),
    [displayMessages],
  );
  const chatListMessages = useMemo(
    () => displayMessages.filter((item) => item.variant !== "booking"),
    [displayMessages],
  );
  const invertedChatListMessages = useMemo(
    () => [...chatListMessages].reverse(),
    [chatListMessages],
  );

  const scrollToLatestMessage = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ animated, offset: 0 });
    });
    setTimeout(() => {
      listRef.current?.scrollToOffset({ animated, offset: 0 });
    }, 80);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatHeaderTitle
          isOnline={opponentOnline}
          title={route.params.title}
        />
      ),
      headerRight: () =>
        canCreateBooking ? (
          <Pressable
            accessibilityLabel="Request booking"
            accessibilityRole="button"
            disabled={isCreatingBooking}
            onPress={() => {
              setCreateBookingForm(createDefaultBookingRequestForm());
              setCreateBookingError("");
              setIsCreateBookingModalVisible(true);
            }}
            style={styles.headerOrderButton}
          >
            <Send color="#FFFFFF" size={17} />
            <Text style={styles.headerOrderButtonText}>Booking</Text>
          </Pressable>
        ) : null,
    });
  }, [
    canCreateBooking,
    isCreatingBooking,
    navigation,
    opponentOnline,
    route.params.title,
  ]);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await getChatMessages(route.params.chatRoomId);
      setMessages(data?.items ?? []);
    } catch {
      setMessages([]);
      setErrorMessage("Couldn't load chat history.");
    } finally {
      setIsLoading(false);
    }
  }, [route.params.chatRoomId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const token = getAccessToken();

    if (!token || !isAppActive) {
      return;
    }

    const websocket = new WebSocket(
      buildChatWebSocketUrl(route.params.chatRoomId),
    );
    websocketRef.current = websocket;

    websocket.onopen = () => {
      websocket.send(JSON.stringify({ type: "auth", token }));
      websocket.send(JSON.stringify({ type: "mark_read" }));
      pingTimerRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    websocket.onmessage = (event) => {
      const data = parseWebSocketMessage(event.data);
      const chatMessage = data?.chat_message;

      if (data?.type === "chat_message" && isIncomingChatMessage(chatMessage)) {
        setMessages((currentMessages) =>
          appendChatMessageWithoutDuplicate(currentMessages, chatMessage),
        );
        if (
          chatMessage.sender_id !== user?.id &&
          websocket.readyState === WebSocket.OPEN
        ) {
          websocket.send(JSON.stringify({ type: "mark_read" }));
        }
        return;
      }

      if (data?.type === "user_online") {
        setOpponentOnline(true);
        return;
      }

      if (data?.type === "user_offline") {
        setOpponentOnline(false);
        return;
      }

      if (data?.type === "error" && typeof data.message === "string") {
        setErrorMessage(data.message);
      }
    };

    websocket.onerror = () => {
      setErrorMessage("Connection lost. Refresh to see new messages.");
    };

    websocket.onclose = () => {
      if (websocketRef.current === websocket) {
        websocketRef.current = null;
      }
    };

    return () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      websocket.close();
      if (websocketRef.current === websocket) {
        websocketRef.current = null;
      }
    };
  }, [isAppActive, route.params.chatRoomId, user?.id]);

  useEffect(() => {
    if (chatListMessages.length > 0) {
      scrollToLatestMessage();
    }
  }, [chatListMessages.length, scrollToLatestMessage]);

  async function handleSend() {
    const cleanText = inputText.trim();

    if (!cleanText || isSending) {
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    try {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        websocketRef.current.send(
          JSON.stringify({
            type: "chat_message",
            message: cleanText,
            attachment_ids: [],
          }),
        );
        setInputText("");
        return;
      }

      const data = await sendChatMessage(route.params.chatRoomId, cleanText);
      if (data?.chat_message) {
        setMessages((currentMessages) =>
          appendChatMessageWithoutDuplicate(currentMessages, data.chat_message),
        );
      }
      setInputText("");
    } catch {
      setErrorMessage("Couldn't send message.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleBookingPress(message: ChatMessage) {
    const bookingId = getBookingIdFromMessage(message);

    if (!bookingId) {
      return;
    }

    setIsBookingActionLoading(true);
    try {
      const booking = await getBookingById(bookingId);
      if (booking && isBookingVisibleInActiveBookingsForDetail(booking, user?.role)) {
        setSelectedBooking(booking);
        setBookingForm(createBookingFormFromDetail(booking));
        setQuoteAmount(booking.quote_amount == null ? "" : String(booking.quote_amount));
        setQuoteMessage("");
        setRejectReason("");
        setQuoteRejectReason("");
        setRefundReason("");
        setRefundAmount("");
        setRefundAppealReason("");
        setRefundRejectReason("");
        setProofAssets([]);
        setFinalQuoteAmount(
          booking.quote_amount == null ? "" : String(booking.quote_amount),
        );
        setFinalQuoteMessage(booking.quote_message || "");
        setBookingActionError("");
      }
    } catch (error) {
      Alert.alert("Couldn't load booking", getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  function closeBookingActionModal() {
    setSelectedBooking(null);
    setBookingForm(null);
    setQuoteAmount("");
    setQuoteMessage("");
    setRejectReason("");
    setQuoteRejectReason("");
    setRefundReason("");
    setRefundAmount("");
    setRefundAppealReason("");
    setRefundRejectReason("");
    setProofAssets([]);
    setFinalQuoteAmount("");
    setFinalQuoteMessage("");
    setBookingActionError("");
  }

  async function handleUpdateBooking() {
    if (!selectedBooking || !bookingForm) {
      return;
    }

    const payload = buildUpdatePayload(selectedBooking, bookingForm);
    if (!payload) {
      Alert.alert("Incomplete booking", "Enter a title (maximum 30 words), description, address, and schedule.");
      return;
    }

    setIsBookingActionLoading(true);
    try {
      await updateCustomerPendingBooking(selectedBooking.id, payload);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      Alert.alert("Update failed", getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleQuoteBooking() {
    if (!selectedBooking) {
      return;
    }

    const amount = Number(quoteAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBookingActionError("Enter a quote amount greater than 0.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await quoteProviderBooking(
        selectedBooking.id,
        amount,
        quoteMessage.trim() || null,
      );
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleRejectBooking() {
    if (!selectedBooking) {
      return;
    }

    const reason = rejectReason.trim();
    if (!reason) {
      setBookingActionError("Enter a reason for declining this booking.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await rejectProviderBooking(selectedBooking.id, reason);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleAcceptQuote() {
    if (!selectedBooking) {
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      const result = await acceptCustomerBookingQuote(selectedBooking.id);
      const chatMessage = result?.chat_message;
      setSelectedBooking(null);
      if (chatMessage) {
        setMessages((currentMessages) => [...currentMessages, chatMessage]);
      } else {
        await loadMessages();
      }
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleRejectQuote() {
    if (!selectedBooking) {
      return;
    }

    const reason = quoteRejectReason.trim();
    if (!reason) {
      setBookingActionError("Enter a reason for declining the quote.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await rejectCustomerBookingQuote(selectedBooking.id, reason);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleCancelBooking() {
    if (!selectedBooking) {
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await cancelCustomerBooking(selectedBooking.id);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handlePayBooking(bookingId?: number) {
    const targetBookingId = bookingId ?? selectedBooking?.id;
    if (!targetBookingId || paymentInFlightRef.current) {
      return;
    }

    paymentInFlightRef.current = true;
    setIsPaymentLoading(true);
    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      const idempotencyKey =
        paymentIdempotencyKeysRef.current[targetBookingId] ??
        (paymentIdempotencyKeysRef.current[targetBookingId] =
          createPaymentIdempotencyKey());
      const result = await payCustomerBooking(
        targetBookingId,
        "iyzico_checkout",
        idempotencyKey,
      );

      if (shouldRotatePaymentIdempotencyKey(result?.payment)) {
        delete paymentIdempotencyKeysRef.current[targetBookingId];
      }

      if (result?.payment_page_url) {
        delete paymentIdempotencyKeysRef.current[targetBookingId];
        await Linking.openURL(result.payment_page_url);
      }

      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      paymentInFlightRef.current = false;
      setIsPaymentLoading(false);
      setIsBookingActionLoading(false);
    }
  }

  async function handleRequestRefund() {
    if (!selectedBooking) {
      return;
    }

    const reason = refundReason.trim();
    if (!reason) {
      setBookingActionError("Enter a refund reason.");
      return;
    }

    const parsedAmount = refundAmount.trim() ? Number(refundAmount) : undefined;
    if (
      parsedAmount !== undefined &&
      (!Number.isFinite(parsedAmount) ||
        parsedAmount <= 0 ||
        (selectedBooking.quote_amount != null &&
          parsedAmount > selectedBooking.quote_amount))
    ) {
      setBookingActionError("Refund amount must be greater than 0 and no more than the paid amount.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await requestCustomerRefund(
        selectedBooking.id,
        reason,
        parsedAmount,
      );
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleCancelRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    if (!refundRequestId) {
      setBookingActionError("This refund request cannot be cancelled.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await cancelCustomerRefund(refundRequestId);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleAppealRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    const reason = refundAppealReason.trim();

    if (!refundRequestId) {
      setBookingActionError("This refund cannot be appealed.");
      return;
    }
    if (!reason) {
      setBookingActionError("Enter an appeal reason.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await appealCustomerRefund(refundRequestId, reason);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleConfirmComplete() {
    if (!selectedBooking) {
      return;
    }

    const bookingToReview = selectedBooking;
    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      const result = await confirmCustomerBookingComplete(bookingToReview.id);
      if (result?.payment_page_url) {
        setSelectedBooking(result.booking ?? bookingToReview);
        await Linking.openURL(result.payment_page_url);
        setBookingActionError(
          "The final quote changed. Complete the new authorization, then confirm again.",
        );
        await loadMessages();
        return;
      }
      setSelectedBooking(null);
      await loadMessages();
      setReviewError("");
      setReviewBooking(
        result?.booking ?? {
          ...bookingToReview,
          status: "completed",
        },
      );
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
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

  async function handlePickCompletionProof() {
    setBookingActionError("");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setBookingActionError("Allow access to photos to attach completion proof.");
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
      setBookingActionError("Add at least one photo or video as completion proof.");
      return;
    }
    const parsedFinalAmount = Number(finalQuoteAmount);
    if (!Number.isFinite(parsedFinalAmount) || parsedFinalAmount <= 0) {
      setBookingActionError("Enter a final quote amount greater than 0.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await completeProviderBooking(
        selectedBooking.id,
        proofAssets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        })),
        parsedFinalAmount,
        finalQuoteMessage.trim() || null,
      );
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleApproveRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    if (!refundRequestId) {
      setBookingActionError("No refund request to review.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await approveProviderRefundRequest(refundRequestId);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleRejectRefund() {
    const refundRequestId = selectedBooking?.current_refund_request?.id;
    const reason = refundRejectReason.trim();

    if (!refundRequestId) {
      setBookingActionError("No refund request to review.");
      return;
    }
    if (!reason) {
      setBookingActionError("Enter a reason for declining the refund.");
      return;
    }

    setIsBookingActionLoading(true);
    setBookingActionError("");
    try {
      await rejectProviderRefundRequest(refundRequestId, reason);
      setSelectedBooking(null);
      await loadMessages();
    } catch (error) {
      setBookingActionError(getErrorMessage(error));
    } finally {
      setIsBookingActionLoading(false);
    }
  }

  async function handleCreateBookingFromChat() {
    if (!route.params.providerProfileId) {
      setCreateBookingError("Provider details are missing. Open this chat from the chat list.");
      return;
    }

    const payload = buildBookingRequestPayload({
      providerProfileId: route.params.providerProfileId,
      chatRoomId: route.params.chatRoomId,
      form: createBookingForm,
    });
    if (!payload) {
      setCreateBookingError("Enter a title (maximum 30 words), description, address, and schedule.");
      return;
    }

    setIsCreatingBooking(true);
    setCreateBookingError("");
    try {
      const result = await createCustomerBooking(payload);
      if (result?.chat_message) {
        setMessages((currentMessages) =>
          appendChatMessageWithoutDuplicate(currentMessages, result.chat_message),
        );
      } else {
        await loadMessages();
      }
      setIsCreateBookingModalVisible(false);
    } catch (error) {
      setCreateBookingError(getErrorMessage(error));
    } finally {
      setIsCreatingBooking(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
      style={styles.container}
    >
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Loading chat...</Text>
        </View>
      ) : (
        <View style={styles.chatArea}>
          {pinnedBookingItem ? (
            <View style={styles.pinnedBookingLayer}>
              <MessageBubble
                displayVariant={pinnedBookingItem.variant}
                isMine={pinnedBookingItem.message.sender_id === user?.id}
                isPinned
                message={pinnedBookingItem.message}
                onBookingPress={() =>
                  void handleBookingPress(pinnedBookingItem.message)
                }
                onPayBooking={() => {
                  const bookingId = getBookingIdFromMessage(
                    pinnedBookingItem.message,
                  );
                  if (bookingId) {
                    void handlePayBooking(bookingId);
                  }
                }}
                isPaying={isPaymentLoading}
                userRole={user?.role}
              />
            </View>
          ) : null}
          <FlatList
            contentContainerStyle={[
              styles.messageList,
              pinnedBookingItem ? styles.messageListWithPinnedBooking : null,
            ]}
            data={invertedChatListMessages}
            inverted
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            }
            onContentSizeChange={() => scrollToLatestMessage(false)}
            onLayout={() => scrollToLatestMessage(false)}
            ref={listRef}
            renderItem={({ item }) => (
              <MessageBubble
                displayVariant={item.variant}
                isMine={item.message.sender_id === user?.id}
                message={item.message}
                onBookingPress={() => void handleBookingPress(item.message)}
                onPayBooking={() => {
                  const bookingId = getBookingIdFromMessage(item.message);
                  if (bookingId) {
                    void handlePayBooking(bookingId);
                  }
                }}
                isPaying={isPaymentLoading}
                userRole={user?.role}
              />
            )}
          />
        </View>
      )}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.inputBar}>
        <TextInput
          multiline
          onChangeText={setInputText}
          placeholder="Message"
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          value={inputText}
        />
        <Pressable
          accessibilityLabel="Send message"
          accessibilityRole="button"
          disabled={!inputText.trim() || isSending}
          onPress={() => void handleSend()}
          style={[
            styles.sendButton,
            !inputText.trim() || isSending ? styles.sendButtonDisabled : null,
          ]}
        >
          <SendHorizontal
            color={!inputText.trim() || isSending ? colors.mutedText : "#FFFFFF"}
            size={20}
          />
        </Pressable>
      </View>

      <BookingActionModal
        booking={selectedBooking}
        bookingForm={bookingForm}
        isLoading={isBookingActionLoading}
        onClose={closeBookingActionModal}
        onQuote={() => void handleQuoteBooking()}
        onReject={() => void handleRejectBooking()}
        onAcceptQuote={() => void handleAcceptQuote()}
        onRejectQuote={() => void handleRejectQuote()}
        onCancelBooking={() => void handleCancelBooking()}
        onPayBooking={() => void handlePayBooking()}
        onUpdate={() => void handleUpdateBooking()}
        onRequestRefund={() => void handleRequestRefund()}
        onCancelRefund={() => void handleCancelRefund()}
        onAppealRefund={() => void handleAppealRefund()}
        onConfirmComplete={() => void handleConfirmComplete()}
        onPickCompletionProof={() => void handlePickCompletionProof()}
        onCompleteBooking={() => void handleCompleteBooking()}
        onApproveRefund={() => void handleApproveRefund()}
        onRejectRefund={() => void handleRejectRefund()}
        actionError={bookingActionError}
        proofAssets={proofAssets}
        finalQuoteAmount={finalQuoteAmount}
        finalQuoteMessage={finalQuoteMessage}
        quoteAmount={quoteAmount}
        quoteMessage={quoteMessage}
        quoteRejectReason={quoteRejectReason}
        refundAppealReason={refundAppealReason}
        refundAmount={refundAmount}
        refundReason={refundReason}
        refundRejectReason={refundRejectReason}
        rejectReason={rejectReason}
        setBookingForm={setBookingForm}
        setQuoteAmount={(value) => {
          setQuoteAmount(value);
          setBookingActionError("");
        }}
        setQuoteMessage={(value) => {
          setQuoteMessage(value);
          setBookingActionError("");
        }}
        setQuoteRejectReason={(value) => {
          setQuoteRejectReason(value);
          setBookingActionError("");
        }}
        setRefundAppealReason={(value) => {
          setRefundAppealReason(value);
          setBookingActionError("");
        }}
        setRefundAmount={(value) => {
          setRefundAmount(value);
          setBookingActionError("");
        }}
        setFinalQuoteAmount={(value) => {
          setFinalQuoteAmount(value);
          setBookingActionError("");
        }}
        setFinalQuoteMessage={(value) => {
          setFinalQuoteMessage(value);
          setBookingActionError("");
        }}
        setRefundReason={(value) => {
          setRefundReason(value);
          setBookingActionError("");
        }}
        setRefundRejectReason={(value) => {
          setRefundRejectReason(value);
          setBookingActionError("");
        }}
        setRejectReason={(value) => {
          setRejectReason(value);
          setBookingActionError("");
        }}
        userRole={user?.role}
      />

      <CustomerReviewModal
        booking={reviewBooking}
        errorMessage={reviewError}
        isSubmitting={isSubmittingReview}
        onClose={() => setReviewBooking(null)}
        onSubmit={(rating, comment) => void handleSubmitReview(rating, comment)}
      />

      <BookingRequestModal
        bookingForm={createBookingForm}
        errorMessage={createBookingError}
        isLoading={isCreatingBooking}
        onClose={() => setIsCreateBookingModalVisible(false)}
        onSubmit={() => void handleCreateBookingFromChat()}
        setBookingForm={setCreateBookingForm}
        visible={isCreateBookingModalVisible}
      />
    </KeyboardAvoidingView>
  );
}

function ChatHeaderTitle({
  title,
  isOnline,
}: {
  title: string;
  isOnline: boolean;
}) {
  return (
    <View style={styles.chatHeaderTitle}>
      <Text numberOfLines={1} style={styles.chatHeaderName}>
        {title}
      </Text>
      <View style={styles.chatHeaderStatus}>
        <View
          style={[
            styles.chatHeaderStatusDot,
            isOnline
              ? styles.chatHeaderStatusDotOnline
              : styles.chatHeaderStatusDotOffline,
          ]}
        />
        <Text style={styles.chatHeaderStatusText}>
          {isOnline ? "Online" : "Offline"}
        </Text>
      </View>
    </View>
  );
}

function MessageBubble({
  displayVariant,
  message,
  isMine,
  isPinned = false,
  onBookingPress,
  onPayBooking,
  isPaying,
  userRole,
}: {
  displayVariant: ChatDisplayItem["variant"];
  message: ChatMessage;
  isMine: boolean;
  isPinned?: boolean;
  onBookingPress: () => void;
  onPayBooking: () => void;
  isPaying: boolean;
  userRole?: string;
}) {
  const isBookingMessage =
    message.related_type === "booking" ||
    message.message_type === "booking_created" ||
    message.message_type === "booking_status";

  return (
    <View
      style={[
        styles.messageRow,
        isMine ? styles.messageRowMine : styles.messageRowOther,
      ]}
    >
      {displayVariant === "booking_update" ? (
        <BookingStatusUpdate message={message} isMine={isMine} />
      ) : displayVariant === "booking" && isBookingMessage ? (
        <BookingMessageCard
          isMine={isMine}
          isPinned={isPinned}
          message={message}
          onPress={onBookingPress}
          onPayBooking={onPayBooking}
          isPaying={isPaying}
          userRole={userRole}
        />
      ) : (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : null]}>
            {formatMessageContent(message)}
          </Text>
          <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : null]}>
            {formatMessageTime(message.created_at)}
          </Text>
        </View>
      )}
    </View>
  );
}

function BookingStatusUpdate({
  message,
  isMine,
}: {
  message: ChatMessage;
  isMine: boolean;
}) {
  const metadata = message.metadata ?? {};
  const status =
    typeof metadata.new_status === "string" ? metadata.new_status : "";
  const detail = typeof metadata.detail === "string" ? metadata.detail : "";
  const title = status
    ? `Booking update: ${getBookingStatusLabelForChat(status)}`
    : typeof metadata.title === "string"
      ? metadata.title
      : "Booking updated";

  return (
    <View
      style={[
        styles.bookingUpdate,
        isMine ? styles.bookingUpdateMine : styles.bookingUpdateOther,
      ]}
    >
      <Text style={styles.bookingUpdateTitle}>{title}</Text>
      {detail ? <Text style={styles.bookingUpdateDetail}>{detail}</Text> : null}
      <Text style={styles.messageTime}>{formatMessageTime(message.created_at)}</Text>
    </View>
  );
}

function BookingMessageCard({
  message,
  isMine,
  isPinned = false,
  onPress,
  onPayBooking,
  isPaying,
  userRole,
}: {
  message: ChatMessage;
  isMine: boolean;
  isPinned?: boolean;
  onPress: () => void;
  onPayBooking: () => void;
  isPaying: boolean;
  userRole?: string;
}) {
  const metadata = message.metadata ?? {};
  const title =
    typeof metadata.title === "string"
      ? metadata.title
      : message.message_type === "booking_created"
        ? "New booking request"
        : "Booking updated";
  const serviceDescription =
    typeof metadata.service_description === "string"
      ? metadata.service_description
      : message.message.split("\n").find((line) => line.startsWith("Service:")) || "";
  const address =
    typeof metadata.service_address === "string" ? metadata.service_address : "";
  const startTime =
    typeof metadata.scheduled_start_time === "string"
      ? metadata.scheduled_start_time
      : "";
  const endTime =
    typeof metadata.scheduled_end_time === "string" ? metadata.scheduled_end_time : "";
  const status =
    typeof metadata.status === "string"
      ? metadata.status
      : typeof metadata.new_status === "string"
        ? metadata.new_status
        : message.message_type === "booking_created"
          ? "pending"
          : "";
  const quoteAmount =
    typeof metadata.quote_amount === "number" ? metadata.quote_amount : null;
  const quoteMessage =
    typeof metadata.quote_message === "string" ? metadata.quote_message : "";
  const canPay = userRole === "customer" && status === "awaiting_payment";
  const canOpenOrder = isBookingVisibleInActiveBookings(status, userRole);

  return (
    <Pressable
      accessibilityRole={canOpenOrder ? "button" : undefined}
      disabled={!canOpenOrder}
      onPress={canOpenOrder ? onPress : undefined}
      style={({ pressed }) => [
        styles.bookingCard,
        isPinned ? styles.bookingCardPinned : null,
        isMine ? styles.bookingCardMine : null,
        pressed ? styles.bookingCardPressed : null,
      ]}
    >
      <View style={styles.bookingTopRow}>
        <Text style={styles.bookingTitle}>{title}</Text>
        {status ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{getBookingStatusLabelForChat(status)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.bookingDescription}>
        {serviceDescription.replace("Service:", "").trim() || "Booking details"}
      </Text>
      {address ? (
        <View style={styles.bookingMetaRow}>
          <MapPin color={colors.mutedText} size={14} />
          <Text numberOfLines={1} style={styles.bookingMetaText}>
            {address}
          </Text>
        </View>
      ) : null}
      {startTime || endTime ? (
        <View style={styles.bookingMetaRow}>
          <CalendarClock color={colors.mutedText} size={14} />
          <Text numberOfLines={1} style={styles.bookingMetaText}>
            {formatShortDateTime(startTime)} - {formatShortDateTime(endTime)}
          </Text>
        </View>
      ) : null}
      {quoteAmount != null ? (
        <Text style={styles.bookingQuoteText}>Quote: {formatMoney(quoteAmount)}</Text>
      ) : null}
      {quoteMessage ? (
        <Text numberOfLines={2} style={styles.bookingQuoteMessage}>
          {quoteMessage}
        </Text>
      ) : null}
      {canOpenOrder ? <Text style={styles.bookingHint}>Tap to view booking</Text> : null}
      {canPay ? (
        <Pressable
          accessibilityRole="button"
          disabled={isPaying}
          onPress={onPayBooking}
          style={styles.bookingPayButton}
        >
          {isPaying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.bookingPayButtonText}>
              {formatPayLabel(quoteAmount)}
            </Text>
          )}
        </Pressable>
      ) : null}
      <Text style={styles.messageTime}>{formatMessageTime(message.created_at)}</Text>
    </Pressable>
  );
}

function BookingActionModal({
  booking,
  bookingForm,
  isLoading,
  actionError,
  onClose,
  onUpdate,
  onQuote,
  onReject,
  onAcceptQuote,
  onRejectQuote,
  onCancelBooking,
  onPayBooking,
  proofAssets,
  finalQuoteAmount,
  finalQuoteMessage,
  quoteAmount,
  quoteMessage,
  quoteRejectReason,
  refundAppealReason,
  refundAmount,
  refundReason,
  refundRejectReason,
  rejectReason,
  onRequestRefund,
  onCancelRefund,
  onAppealRefund,
  onConfirmComplete,
  onPickCompletionProof,
  onCompleteBooking,
  onApproveRefund,
  onRejectRefund,
  setBookingForm,
  setQuoteAmount,
  setQuoteMessage,
  setQuoteRejectReason,
  setRefundAppealReason,
  setRefundAmount,
  setFinalQuoteAmount,
  setFinalQuoteMessage,
  setRefundReason,
  setRefundRejectReason,
  setRejectReason,
  userRole,
}: {
  booking: BookingDetail | null;
  bookingForm: BookingRequestFormState | null;
  isLoading: boolean;
  actionError: string;
  onClose: () => void;
  onUpdate: () => void;
  onQuote: () => void;
  onReject: () => void;
  onAcceptQuote: () => void;
  onRejectQuote: () => void;
  onCancelBooking: () => void;
  onPayBooking: () => void;
  onRequestRefund: () => void;
  onCancelRefund: () => void;
  onAppealRefund: () => void;
  onConfirmComplete: () => void;
  onPickCompletionProof: () => void;
  onCompleteBooking: () => void;
  onApproveRefund: () => void;
  onRejectRefund: () => void;
  proofAssets: ImagePicker.ImagePickerAsset[];
  finalQuoteAmount: string;
  finalQuoteMessage: string;
  quoteAmount: string;
  quoteMessage: string;
  quoteRejectReason: string;
  refundAppealReason: string;
  refundAmount: string;
  refundReason: string;
  refundRejectReason: string;
  rejectReason: string;
  setBookingForm: (value: BookingRequestFormState | null) => void;
  setQuoteAmount: (value: string) => void;
  setQuoteMessage: (value: string) => void;
  setQuoteRejectReason: (value: string) => void;
  setRefundAppealReason: (value: string) => void;
  setRefundAmount: (value: string) => void;
  setFinalQuoteAmount: (value: string) => void;
  setFinalQuoteMessage: (value: string) => void;
  setRefundReason: (value: string) => void;
  setRefundRejectReason: (value: string) => void;
  setRejectReason: (value: string) => void;
  userRole?: string;
}) {
  if (!booking) {
    return null;
  }

  const canCustomerEdit = userRole === "customer" && booking?.status === "pending";
  const canCustomerReviewQuote =
    userRole === "customer" && booking?.status === "quoted";
  const canCustomerPay =
    userRole === "customer" && booking?.status === "awaiting_payment";
  const canCustomerCancel =
    userRole === "customer" &&
    CANCELLABLE_STATUSES.includes(String(booking?.status));
  const canCustomerRequestRefund =
    userRole === "customer" && booking?.status === "completed";
  const canCustomerConfirmComplete =
    userRole === "customer" && booking?.status === "awaiting_confirmation";
  const canCustomerCancelRefund =
    userRole === "customer" &&
    booking?.status === "refunding" &&
    ["pending", "rejected"].includes(
      String(booking?.current_refund_request?.status || ""),
    );
  const canCustomerAppealRefund =
    userRole === "customer" &&
    booking?.status === "refunding" &&
    booking?.current_refund_request?.status === "rejected";
  const canProviderRespond = userRole === "provider" && booking?.status === "pending";
  const canProviderComplete = userRole === "provider" && booking?.status === "accepted";
  const canProviderProcessRefund =
    userRole === "provider" &&
    booking?.status === "refunding" &&
    booking?.current_refund_request?.status === "pending";
  const hasAnyAction =
    canCustomerEdit ||
    canCustomerReviewQuote ||
    canCustomerPay ||
    canCustomerCancel ||
    canCustomerRequestRefund ||
    canCustomerConfirmComplete ||
    canCustomerCancelRefund ||
    canCustomerAppealRefund ||
    canProviderRespond ||
    canProviderComplete ||
    canProviderProcessRefund;

  function updateFormField(field: keyof BookingRequestFormState, value: string) {
    if (!bookingForm) {
      return;
    }

    setBookingForm({
      ...bookingForm,
      [field]: value,
    });
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Booking #{booking.id}</Text>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Current status</Text>
                <Text style={styles.detailValue}>{getBookingStatusLabelForChat(booking.status)}</Text>
                {booking.booking_notice ? (
                  <>
                    <Text style={styles.detailLabel}>Notice</Text>
                    <Text style={styles.detailValue}>{booking.booking_notice}</Text>
                  </>
                ) : null}
                <Text style={styles.detailLabel}>
                  {userRole === "provider" ? "Customer" : "Provider"}
                </Text>
                <Text style={styles.detailValue}>
                  {userRole === "provider"
                    ? booking.customer?.name || `Customer #${booking.customer_id}`
                    : booking.provider?.business_name ||
                      `Provider #${booking.provider_profile_id}`}
                </Text>
                <Text style={styles.detailLabel}>Booking title</Text>
                <Text style={styles.detailValue}>{booking.title}</Text>
                <Text style={styles.detailLabel}>Service description</Text>
                <Text style={styles.detailValue}>{booking.service_description}</Text>
                <Text style={styles.detailLabel}>Service address</Text>
                <Text style={styles.detailValue}>{booking.service_address}</Text>
                <Text style={styles.detailLabel}>Scheduled time</Text>
                <Text style={styles.detailValue}>
                  {formatShortDateTime(booking.scheduled_start_time)} -{" "}
                  {formatShortDateTime(booking.scheduled_end_time)}
                </Text>
                {booking.quote_amount != null ? (
                  <>
                    <Text style={styles.detailLabel}>Quote</Text>
                    <Text style={styles.detailValue}>
                      {formatMoney(booking.quote_amount)}
                    </Text>
                  </>
                ) : null}
                {booking.quote_message ? (
                  <>
                    <Text style={styles.detailLabel}>Quote notes</Text>
                    <Text style={styles.detailValue}>{booking.quote_message}</Text>
                  </>
                ) : null}
                {booking.status_note ? (
                  <>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue}>{booking.status_note}</Text>
                  </>
                ) : null}
                {booking.current_refund_request ? (
                  <>
                    <Text style={styles.detailLabel}>Refund status</Text>
                    <Text style={styles.detailValue}>
                      {getRefundStatusLabel(booking.current_refund_request.status)}
                    </Text>
                    <Text style={styles.detailLabel}>Refund reason</Text>
                    <Text style={styles.detailValue}>
                      {booking.current_refund_request.reason}
                    </Text>
                    <Text style={styles.detailLabel}>Refund amount</Text>
                    <Text style={styles.detailValue}>
                      {booking.current_refund_request.refund_amount == null
                        ? "Full paid amount"
                        : formatMoney(booking.current_refund_request.refund_amount)}
                    </Text>
                    <Text style={styles.detailLabel}>Provider response</Text>
                    <Text style={styles.detailValue}>
                      {booking.current_refund_request.provider_note || "—"}
                    </Text>
                    <Text style={styles.detailLabel}>Appeal reason</Text>
                    <Text style={styles.detailValue}>
                      {booking.current_refund_request.appeal_reason || "—"}
                    </Text>
                    <Text style={styles.detailLabel}>Support response</Text>
                    <Text style={styles.detailValue}>
                      {booking.current_refund_request.admin_note || "—"}
                    </Text>
                  </>
                ) : null}
              </View>

              {userRole === "customer" ? (
                <CompletionProofGallery booking={booking} />
              ) : null}

              {canCustomerEdit && bookingForm ? (
                <>
                  <TextField
                    label="Booking title"
                    onChangeText={(value) => updateFormField("title", value)}
                    value={bookingForm.title}
                  />
                  <TextField
                    label="Service description"
                    multiline
                    numberOfLines={3}
                    onChangeText={(value) =>
                      updateFormField("serviceDescription", value)
                    }
                    value={bookingForm.serviceDescription}
                  />
                  <TextField
                    label="Service address"
                    onChangeText={(value) => updateFormField("serviceAddress", value)}
                    value={bookingForm.serviceAddress}
                  />
                  <DateTimeField
                    label="Start time"
                    onChange={(value) =>
                      updateFormField("scheduledStartTime", value)
                    }
                    value={bookingForm.scheduledStartTime}
                  />
                  <DateTimeField
                    label="End time"
                    onChange={(value) =>
                      updateFormField("scheduledEndTime", value)
                    }
                    value={bookingForm.scheduledEndTime}
                  />
                </>
              ) : null}

              {canCustomerReviewQuote ? (
                <>
                  <TextField
                    label="Decline reason"
                    multiline
                    numberOfLines={2}
                    onChangeText={setQuoteRejectReason}
                    placeholder="Required to decline this quote"
                    value={quoteRejectReason}
                  />
                </>
              ) : null}

              {canCustomerPay ? (
                <Text style={styles.payHint}>
                  This demo authorizes {formatMoney(booking.quote_amount)} first. The payment is captured after service completion.
                </Text>
              ) : null}

              {canProviderRespond ? (
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

              {canCustomerRequestRefund ? (
                <>
                  <TextField
                    keyboardType="decimal-pad"
                    label="Refund amount (optional)"
                    onChangeText={setRefundAmount}
                    placeholder="Leave blank for full refund"
                    value={refundAmount}
                  />
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

              {canCustomerAppealRefund ? (
                <TextField
                  label="Appeal reason"
                  multiline
                  numberOfLines={3}
                  onChangeText={setRefundAppealReason}
                  placeholder="Reason for appeal"
                  value={refundAppealReason}
                />
              ) : null}

              {canProviderComplete ? (
                <View style={styles.proofBox}>
                  <TextField
                    keyboardType="decimal-pad"
                    label="Final quote amount"
                    onChangeText={setFinalQuoteAmount}
                    placeholder="Enter the final amount"
                    value={finalQuoteAmount}
                  />
                  <TextField
                    label="Final quote message"
                    multiline
                    numberOfLines={2}
                    onChangeText={setFinalQuoteMessage}
                    placeholder="Explain the final amount if it changed"
                    value={finalQuoteMessage}
                  />
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
                    disabled={isLoading}
                    label="Add proof"
                    onPress={onPickCompletionProof}
                  />
                </View>
              ) : null}

              {canProviderProcessRefund ? (
                <TextField
                  label="Decline reason"
                  multiline
                  numberOfLines={3}
                  onChangeText={setRefundRejectReason}
                  placeholder="Required to decline this refund"
                  value={refundRejectReason}
                />
              ) : null}

              {!hasAnyAction ? (
                <Text style={styles.noActionText}>No actions available for this booking status.</Text>
              ) : null}

              {actionError ? (
                <Text style={styles.modalErrorText}>{actionError}</Text>
              ) : null}

          </ScrollView>

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isLoading} label="Close" onPress={onClose} />
            {canCustomerCancel ? (
              <SecondaryButton
                disabled={isLoading}
                label="Cancel booking"
                onPress={onCancelBooking}
              />
            ) : null}
            {canCustomerEdit ? (
              <PrimaryButton
                disabled={isLoading}
                isLoading={isLoading}
                label="Save changes"
                onPress={onUpdate}
              />
            ) : null}
            {canCustomerReviewQuote ? (
              <>
                <SecondaryButton
                  disabled={isLoading}
                  label="Decline quote"
                  onPress={onRejectQuote}
                />
                <PrimaryButton
                  disabled={isLoading}
                  isLoading={isLoading}
                  label="Accept quote"
                  onPress={onAcceptQuote}
                />
              </>
            ) : null}
            {canCustomerPay ? (
              <PrimaryButton
                disabled={isLoading}
                isLoading={isLoading}
                label={formatPayLabel(booking.quote_amount)}
                onPress={onPayBooking}
              />
            ) : null}
            {canCustomerConfirmComplete ? (
              <PrimaryButton
                disabled={isLoading}
                isLoading={isLoading}
                label="Confirm complete"
                onPress={onConfirmComplete}
              />
            ) : null}
            {canCustomerRequestRefund ? (
              <SecondaryButton
                disabled={isLoading}
                label="Request refund"
                onPress={onRequestRefund}
              />
            ) : null}
            {canCustomerCancelRefund ? (
              <SecondaryButton
                disabled={isLoading}
                label="Cancel refund"
                onPress={onCancelRefund}
              />
            ) : null}
            {canCustomerAppealRefund ? (
              <PrimaryButton
                disabled={isLoading}
                isLoading={isLoading}
                label="Submit appeal"
                onPress={onAppealRefund}
              />
            ) : null}
            {canProviderRespond ? (
              <>
                <SecondaryButton
                  disabled={isLoading}
                  label="Decline booking"
                  onPress={onReject}
                />
                <PrimaryButton
                  disabled={isLoading}
                  isLoading={isLoading}
                  label="Send quote"
                  onPress={onQuote}
                />
              </>
            ) : null}
            {canProviderComplete ? (
              <PrimaryButton
                disabled={isLoading}
                isLoading={isLoading}
                label="Mark complete"
                onPress={onCompleteBooking}
              />
            ) : null}
            {canProviderProcessRefund ? (
              <>
                <SecondaryButton
                  disabled={isLoading}
                  label="Reject refund"
                  onPress={onRejectRefund}
                />
                <PrimaryButton
                  disabled={isLoading}
                  isLoading={isLoading}
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

function createBookingFormFromDetail(
  booking: BookingDetail,
): BookingRequestFormState {
  return {
    title: booking.title,
    serviceDescription: booking.service_description,
    serviceAddress: booking.service_address,
    scheduledStartTime: toEditableDateTime(booking.scheduled_start_time),
    scheduledEndTime: toEditableDateTime(booking.scheduled_end_time),
    attachments: [],
  };
}

function buildUpdatePayload(
  booking: BookingDetail,
  form: BookingRequestFormState,
): BookingPayload | null {
  if (
    !form.title.trim() ||
    form.title.trim().split(/\s+/).length > 30 ||
    !form.serviceDescription.trim() ||
    !form.serviceAddress.trim() ||
    !form.scheduledStartTime.trim() ||
    !form.scheduledEndTime.trim()
  ) {
    return null;
  }

  return {
    title: form.title.trim(),
    service_description: form.serviceDescription.trim(),
    service_address: form.serviceAddress.trim(),
    service_latitude: booking.service_latitude,
    service_longitude: booking.service_longitude,
    customer_current_address: booking.customer_current_address,
    customer_current_latitude: booking.customer_current_latitude,
    customer_current_longitude: booking.customer_current_longitude,
    scheduled_start_time: form.scheduledStartTime.trim(),
    scheduled_end_time: form.scheduledEndTime.trim(),
  };
}

function parseWebSocketMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const data = JSON.parse(value);
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isIncomingChatMessage(value: unknown): value is ChatMessage {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as ChatMessage).id === "number" &&
    typeof (value as ChatMessage).chat_room_id === "number" &&
    typeof (value as ChatMessage).sender_id === "number"
  );
}

function appendChatMessageWithoutDuplicate(
  currentMessages: ChatMessage[],
  nextMessage: ChatMessage,
) {
  if (currentMessages.some((message) => message.id === nextMessage.id)) {
    return currentMessages;
  }

  return [...currentMessages, nextMessage];
}

function collapseBookingMessages(messages: ChatMessage[]): ChatDisplayItem[] {
  const result: ChatDisplayItem[] = [];
  const bookingCardIndexes = new Map<number, number>();

  for (const message of messages) {
    if (!isBookingMessage(message)) {
      result.push({
        key: `message-${message.id}`,
        message,
        variant: "message",
      });
      continue;
    }

    const bookingId = getBookingIdFromMessage(message);
    if (!bookingId) {
      result.push({
        key: `message-${message.id}`,
        message,
        variant: "message",
      });
      continue;
    }

    const existingCardIndex = bookingCardIndexes.get(bookingId);
    if (existingCardIndex === undefined) {
      result.push({
        key: `booking-${bookingId}`,
        message,
        variant: "booking",
      });
      bookingCardIndexes.set(bookingId, result.length - 1);
      continue;
    }

    const existingCard = result[existingCardIndex];
    if (existingCard.variant === "booking") {
      existingCard.message = {
        ...existingCard.message,
        metadata: mergeBookingPreviewMetadata(
          existingCard.message.metadata,
          message.metadata,
        ),
      };
    }

    result.push({
      key: `booking-update-${message.id}`,
      message,
      variant: "booking_update",
    });
  }

  return result;
}

function isBookingMessage(message: ChatMessage) {
  return (
    message.related_type === "booking" ||
    message.message_type === "booking_created" ||
    message.message_type === "booking_status"
  );
}

function mergeBookingPreviewMetadata(
  current: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
) {
  const merged = { ...(current ?? {}) };
  const latest = next ?? {};
  const latestStatus =
    typeof latest.new_status === "string"
      ? latest.new_status
      : typeof latest.status === "string"
        ? latest.status
        : null;

  for (const key of [
    "quote_amount",
    "quote_message",
    "quoted_at",
    "currency",
    "amount",
    "payment_id",
    "payment_status",
    "paid_at",
    "refund_request_id",
    "refund_status",
    "provider_note",
    "appeal_reason",
    "completed_at",
  ]) {
    if (key in latest) {
      merged[key] = latest[key];
    }
  }

  if (latestStatus) {
    merged.status = latestStatus;
  }

  return merged;
}

function getLatestBookingCardItem(items: ChatDisplayItem[]) {
  const bookingCards = new Map<number, ChatDisplayItem>();

  for (const item of items) {
    if (item.variant !== "booking") {
      continue;
    }

    const bookingId = getBookingIdFromMessage(item.message);
    if (bookingId) {
      bookingCards.set(bookingId, item);
    }
  }

  let latestActivity: { item: ChatDisplayItem; timestamp: number } | null = null;

  for (const item of items) {
    const bookingId = getBookingIdFromMessage(item.message);
    if (!bookingId) {
      continue;
    }

    const bookingCard = bookingCards.get(bookingId);
    if (
      bookingCard &&
      !PINNED_BOOKING_HIDDEN_STATUSES.includes(
        getBookingPreviewStatus(bookingCard.message),
      )
    ) {
      const timestamp = Date.parse(item.message.created_at);
      if (!latestActivity || timestamp >= latestActivity.timestamp) {
        latestActivity = {
          item: bookingCard,
          timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
        };
      }
    }
  }

  return latestActivity?.item ?? null;
}

function getBookingPreviewStatus(message: ChatMessage) {
  const metadata = message.metadata ?? {};

  if (typeof metadata.status === "string") {
    return metadata.status;
  }

  if (typeof metadata.new_status === "string") {
    return metadata.new_status;
  }

  return "";
}

function getBookingIdFromMessage(message: ChatMessage) {
  if (message.related_type === "booking" && message.related_id) {
    return message.related_id;
  }

  const bookingId = message.metadata?.booking_id;

  if (typeof bookingId === "number") {
    return bookingId;
  }

  if (typeof bookingId === "string") {
    const parsed = Number(bookingId);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatMessageContent(message: ChatMessage) {
  if (message.attachments.length > 0 || message.message_type === "attachment") {
    const hasPicture = message.attachments.some((attachment) =>
      attachment.content_type.startsWith("image/"),
    );

    return hasPicture ? "[picture]" : "[file]";
  }

  return message.message || " ";
}

function isBookingVisibleInActiveBookings(
  status: string,
  userRole?: string,
) {
  return (
    (userRole === "customer" || userRole === "provider") &&
    Boolean(status) &&
    !PINNED_BOOKING_HIDDEN_STATUSES.includes(status)
  );
}

function isBookingVisibleInActiveBookingsForDetail(
  booking: BookingDetail,
  userRole?: string,
) {
  return isBookingVisibleInActiveBookings(String(booking.status), userRole);
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerOrderButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
  },
  headerOrderButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  centerText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  chatHeaderTitle: {
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chatHeaderName: {
    maxWidth: 132,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  chatHeaderStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  chatHeaderStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chatHeaderStatusDotOnline: {
    backgroundColor: colors.primary,
  },
  chatHeaderStatusDotOffline: {
    backgroundColor: "#A0A4AE",
  },
  chatHeaderStatusText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  chatArea: {
    flex: 1,
  },
  pinnedBookingLayer: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
    elevation: 8,
  },
  messageList: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  messageListWithPinnedBooking: {
    paddingBottom: 188,
  },
  emptyBox: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 15,
  },
  messageRow: {
    flexDirection: "row",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  bubbleTextMine: {
    color: "#FFFFFF",
  },
  messageTime: {
    alignSelf: "flex-end",
    color: colors.mutedText,
    fontSize: 11,
  },
  messageTimeMine: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  bookingCard: {
    width: "82%",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  bookingCardPinned: {
    width: "100%",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  bookingCardMine: {
    backgroundColor: "#E8F7F2",
    borderColor: "#B7E4D5",
  },
  bookingCardPressed: {
    opacity: 0.76,
  },
  bookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  bookingTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  bookingDescription: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  bookingQuoteText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  bookingQuoteMessage: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  bookingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  bookingMetaText: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 12,
  },
  bookingHint: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  bookingUpdate: {
    maxWidth: "82%",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bookingUpdateMine: {
    backgroundColor: "#E8F7F2",
  },
  bookingUpdateOther: {
    backgroundColor: colors.surface,
  },
  bookingUpdateTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  bookingUpdateDetail: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  bookingPayButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  bookingPayButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  input: {
    maxHeight: 120,
    minHeight: 44,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  modalCard: {
    maxHeight: "92%",
    gap: spacing.md,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  modalErrorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  payHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  modalScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  detailBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  detailLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
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
    backgroundColor: colors.surface,
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
  noActionText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
