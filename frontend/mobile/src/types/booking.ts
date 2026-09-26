import type { User } from "./auth";
import type { ChatMessage, ChatRoom } from "./chat";
import type { ProviderProfile } from "./provider";

export type BookingStatus =
  | "pending"
  | "quoted"
  | "awaiting_payment"
  | "accepted"
  | "rejected"
  | "refunding"
  | "refunded"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled"
  | string;

export type BookingDetail = {
  id: number;
  customer_id: number;
  provider_profile_id: number;
  chat_room_id: number | null;
  title: string;
  service_description: string;
  service_address: string;
  service_latitude: number;
  service_longitude: number;
  customer_current_address: string | null;
  customer_current_latitude: number | null;
  customer_current_longitude: number | null;
  booking_at: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  completed_at: string | null;
  total_amount: number;
  quote_amount: number | null;
  quote_message: string | null;
  quoted_at: string | null;
  status: BookingStatus;
  status_note: string | null;
  customer?: User | null;
  provider?: ProviderProfile | null;
  attachments?: BookingAttachment[];
  current_refund_request?: RefundRequestSummary | null;
};

export type BookingAttachment = {
  id: number;
  booking_id: number;
  uploaded_by_user_id: number;
  original_file_name: string;
  file_name: string;
  file_url: string;
  content_type: string;
  size: number;
  created_at: string;
};

export type RefundServiceStage =
  | "not_started"
  | "in_progress"
  | "service_completed";

export type RefundRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "appealed"
  | "admin_rejected"
  | "cancelled"
  | string;

export type RefundRequestSummary = {
  id: number;
  booking_id: number;
  payment_id: number;
  customer_id: number;
  provider_profile_id: number;
  service_stage: RefundServiceStage | string;
  reason: string;
  status: RefundRequestStatus;
  provider_note: string | null;
  appeal_reason: string | null;
  admin_note: string | null;
  previous_booking_status: string;
  created_at: string;
  responded_at: string | null;
  appealed_at: string | null;
  admin_responded_at: string | null;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  booking?: BookingDetail | null;
  payment?: PaymentSummary | null;
};

export type PaymentSummary = {
  id: number;
  booking_id: number;
  customer_id: number;
  provider_profile_id: number;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  external_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
};

/** What /customer/payments and /provider/payments return: a payment plus its booking. */
export type PaymentHistoryEntry = PaymentSummary & {
  booking?: BookingDetail | null;
};

export type BookingPayload = {
  provider_profile_id?: number;
  chat_room_id?: number | null;
  title: string;
  service_description: string;
  service_address: string;
  service_latitude: number;
  service_longitude: number;
  customer_current_address?: string | null;
  customer_current_latitude?: number | null;
  customer_current_longitude?: number | null;
  scheduled_start_time: string;
  scheduled_end_time: string;
  attachments?: BookingUploadFile[];
};

export type BookingUploadFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number | null;
};

export type BookingCreateResponseData = {
  message?: string;
  booking: BookingDetail;
  chat_room: ChatRoom;
  chat_message: ChatMessage;
};

export type BookingUpdateResponseData = {
  message: string;
  booking: BookingDetail;
  chat_message: ChatMessage | null;
};

export type BookingActionResponseData = {
  message: string;
  booking: BookingDetail;
  chat_message?: ChatMessage | null;
  refund_request?: RefundRequestSummary | null;
};
