import type { ChatMessage } from "../types/chat";
import type { AppLanguage } from "./language";

export type BookingEventDetailKind = "system" | "user_text";

type BookingEventKey =
  | "booking.created"
  | "booking.updated_by_customer"
  | "booking.cancelled_by_customer"
  | "booking.refund_requested"
  | "booking.refund_appealed"
  | "booking.refund_cancelled_by_customer"
  | "booking.visit_fee_paid"
  | "booking.service_fee_paid"
  | "booking.initial_quote_accepted"
  | "booking.initial_quote_rejected"
  | "booking.final_quote_accepted"
  | "booking.final_quote_rejected"
  | "booking.closed_without_refund"
  | "booking.completion_confirmed"
  | "booking.completion_rejected"
  | "booking.visit_started"
  | "booking.final_quote_submitted"
  | "booking.refund_approved_by_provider"
  | "booking.refund_rejected_by_provider"
  | "booking.initial_quote_submitted"
  | "booking.rejected_by_provider"
  | "booking.completion_submitted_by_provider"
  | "booking.status_updated_by_admin"
  | "booking.refund_appeal_approved_by_admin"
  | "booking.refund_appeal_rejected_by_admin";

type EventTemplate = {
  title: { en: string; tr: string };
  detail?: { en: string; tr: string };
};

const templates: Record<BookingEventKey, EventTemplate> = {
  "booking.created": {
    title: { en: "New booking request", tr: "Yeni rezervasyon talebi" },
  },
  "booking.updated_by_customer": {
    title: {
      en: "Customer updated the booking request",
      tr: "Müşteri rezervasyon talebini güncelledi",
    },
    detail: {
      en: "Customer updated booking request",
      tr: "Müşteri rezervasyon talebini güncelledi",
    },
  },
  "booking.cancelled_by_customer": {
    title: { en: "Customer cancelled the booking", tr: "Müşteri rezervasyonu iptal etti" },
    detail: { en: "Customer cancelled booking", tr: "Müşteri rezervasyonu iptal etti" },
  },
  "booking.refund_requested": {
    title: { en: "Customer requested a refund", tr: "Müşteri iade talep etti" },
  },
  "booking.refund_appealed": {
    title: {
      en: "Customer appealed the rejected refund request",
      tr: "Müşteri reddedilen iade talebine itiraz etti",
    },
  },
  "booking.refund_cancelled_by_customer": {
    title: {
      en: "Customer cancelled the refund request",
      tr: "Müşteri iade talebini iptal etti",
    },
    detail: {
      en: "Customer cancelled refund request",
      tr: "Müşteri iade talebini iptal etti",
    },
  },
  "booking.visit_fee_paid": {
    title: {
      en: "Customer paid the visit fee; provider can start the visit",
      tr: "Müşteri ziyaret ücretini ödedi; hizmet sağlayıcı ziyareti başlatabilir",
    },
    detail: {
      en: "Visit fee paid; provider must submit arrival evidence",
      tr: "Ziyaret ücreti ödendi; hizmet sağlayıcı varış kanıtı göndermelidir",
    },
  },
  "booking.service_fee_paid": {
    title: {
      en: "Customer paid the final service quote",
      tr: "Müşteri nihai hizmet teklifini ödedi",
    },
    detail: {
      en: "Service fee paid; provider can complete the service",
      tr: "Hizmet ücreti ödendi; hizmet sağlayıcı hizmeti tamamlayabilir",
    },
  },
  "booking.initial_quote_accepted": {
    title: {
      en: "Customer accepted the quote. Visit-fee payment is pending",
      tr: "Müşteri teklifi kabul etti. Ziyaret ücreti ödemesi bekleniyor",
    },
    detail: {
      en: "Customer accepted the quote and is waiting to pay the visit fee",
      tr: "Müşteri teklifi kabul etti ve ziyaret ücretini ödemesi bekleniyor",
    },
  },
  "booking.initial_quote_rejected": {
    title: { en: "Customer rejected the quote", tr: "Müşteri teklifi reddetti" },
  },
  "booking.final_quote_accepted": {
    title: { en: "Customer accepted the final quote", tr: "Müşteri nihai teklifi kabul etti" },
    detail: {
      en: "Customer accepted the final quote and is waiting to pay",
      tr: "Müşteri nihai teklifi kabul etti ve ödeme yapması bekleniyor",
    },
  },
  "booking.final_quote_rejected": {
    title: { en: "Customer declined the final quote", tr: "Müşteri nihai teklifi reddetti" },
  },
  "booking.closed_without_refund": {
    title: {
      en: "Customer cancelled the booking without requesting a refund",
      tr: "Müşteri iade talep etmeden rezervasyonu iptal etti",
    },
  },
  "booking.completion_confirmed": {
    title: {
      en: "Customer confirmed service completion",
      tr: "Müşteri hizmetin tamamlandığını onayladı",
    },
    detail: {
      en: "Customer confirmed service completion",
      tr: "Müşteri hizmetin tamamlandığını onayladı",
    },
  },
  "booking.completion_rejected": {
    title: {
      en: "Customer rejected service completion",
      tr: "Müşteri hizmetin tamamlandığını onaylamadı",
    },
  },
  "booking.visit_started": {
    title: { en: "Provider started the visit", tr: "Hizmet sağlayıcı ziyareti başlattı" },
    detail: {
      en: "Provider arrived and submitted visit evidence",
      tr: "Hizmet sağlayıcı geldi ve varış kanıtını gönderdi",
    },
  },
  "booking.final_quote_submitted": {
    title: {
      en: "Provider submitted the final quote",
      tr: "Hizmet sağlayıcı nihai teklifi gönderdi",
    },
    detail: {
      en: "Provider submitted the final quote",
      tr: "Hizmet sağlayıcı nihai teklifi gönderdi",
    },
  },
  "booking.refund_approved_by_provider": {
    title: {
      en: "Provider approved the refund request",
      tr: "Hizmet sağlayıcı iade talebini onayladı",
    },
    detail: {
      en: "Provider approved refund request",
      tr: "Hizmet sağlayıcı iade talebini onayladı",
    },
  },
  "booking.refund_rejected_by_provider": {
    title: {
      en: "Provider rejected the refund request",
      tr: "Hizmet sağlayıcı iade talebini reddetti",
    },
  },
  "booking.initial_quote_submitted": {
    title: { en: "Provider submitted a quote", tr: "Hizmet sağlayıcı teklif gönderdi" },
    detail: {
      en: "Provider submitted an initial quote",
      tr: "Hizmet sağlayıcı ilk teklifi gönderdi",
    },
  },
  "booking.rejected_by_provider": {
    title: {
      en: "Provider rejected the booking request",
      tr: "Hizmet sağlayıcı rezervasyon talebini reddetti",
    },
  },
  "booking.completion_submitted_by_provider": {
    title: {
      en: "Provider marked the service as complete",
      tr: "Hizmet sağlayıcı hizmeti tamamlandı olarak işaretledi",
    },
    detail: {
      en: "Provider marked service as complete",
      tr: "Hizmet sağlayıcı hizmeti tamamlandı olarak işaretledi",
    },
  },
  "booking.status_updated_by_admin": {
    title: {
      en: "Admin updated the booking status",
      tr: "Yönetici rezervasyon durumunu güncelledi",
    },
  },
  "booking.refund_appeal_approved_by_admin": {
    title: {
      en: "Admin approved the refund appeal",
      tr: "Yönetici iade itirazını onayladı",
    },
  },
  "booking.refund_appeal_rejected_by_admin": {
    title: {
      en: "Admin rejected the refund appeal",
      tr: "Yönetici iade itirazını reddetti",
    },
  },
};

const legacyTitles: Record<string, BookingEventKey> = {
  "Customer updated the booking request": "booking.updated_by_customer",
  "Customer cancelled the booking": "booking.cancelled_by_customer",
  "Customer requested a refund": "booking.refund_requested",
  "Customer appealed the rejected refund request": "booking.refund_appealed",
  "Customer cancelled the refund request": "booking.refund_cancelled_by_customer",
  "Customer paid the visit fee; provider can start the visit": "booking.visit_fee_paid",
  "Customer paid the final service quote": "booking.service_fee_paid",
  "Customer accepted the quote. Visit-fee payment is pending": "booking.initial_quote_accepted",
  "Customer rejected the quote": "booking.initial_quote_rejected",
  "Customer accepted the final quote": "booking.final_quote_accepted",
  "Customer declined the final quote": "booking.final_quote_rejected",
  "Customer cancelled the booking without requesting a refund": "booking.closed_without_refund",
  "Customer confirmed service completion": "booking.completion_confirmed",
  "Customer rejected service completion": "booking.completion_rejected",
  "Provider started the visit": "booking.visit_started",
  "Provider submitted the final quote": "booking.final_quote_submitted",
  "Provider approved the refund request": "booking.refund_approved_by_provider",
  "Provider rejected the refund request": "booking.refund_rejected_by_provider",
  "Provider rejected the booking request": "booking.rejected_by_provider",
  "Provider marked the service as complete": "booking.completion_submitted_by_provider",
  "Admin updated the booking status": "booking.status_updated_by_admin",
  "Admin approved the refund appeal": "booking.refund_appeal_approved_by_admin",
  "Admin rejected the refund appeal": "booking.refund_appeal_rejected_by_admin",
};

const legacyStatusEvents: Record<string, BookingEventKey> = {
  quoted: "booking.initial_quote_submitted",
  awaiting_visit_payment: "booking.initial_quote_accepted",
  visit_paid: "booking.visit_fee_paid",
  provider_arrived: "booking.visit_started",
  final_quote_sent: "booking.final_quote_submitted",
  awaiting_service_payment: "booking.final_quote_accepted",
  service_paid: "booking.service_fee_paid",
  awaiting_confirmation: "booking.completion_submitted_by_provider",
  completed: "booking.completion_confirmed",
};

const userDetailEvents = new Set<BookingEventKey>([
  "booking.refund_requested",
  "booking.refund_appealed",
  "booking.initial_quote_rejected",
  "booking.final_quote_rejected",
  "booking.closed_without_refund",
  "booking.completion_rejected",
  "booking.refund_rejected_by_provider",
  "booking.rejected_by_provider",
  "booking.status_updated_by_admin",
  "booking.refund_appeal_approved_by_admin",
  "booking.refund_appeal_rejected_by_admin",
]);

const knownSystemText: Record<string, string> = Object.values(templates).reduce(
  (result, template) => {
    if (template.detail) result[template.detail.en] = template.detail.tr;
    return result;
  },
  {} as Record<string, string>,
);

function isBookingEventKey(value: unknown): value is BookingEventKey {
  return typeof value === "string" && value in templates;
}

function resolveEventKey(message: Pick<ChatMessage, "message_type" | "metadata">): BookingEventKey | null {
  const metadata = message.metadata ?? {};
  if (isBookingEventKey(metadata.event_key)) return metadata.event_key;
  if (message.message_type === "booking_created") return "booking.created";

  const title = typeof metadata.title === "string" ? metadata.title : "";
  if (title.startsWith("Provider submitted a quote: visit fee ")) {
    return "booking.initial_quote_submitted";
  }
  if (legacyTitles[title]) return legacyTitles[title];

  const status = typeof metadata.new_status === "string"
    ? metadata.new_status
    : typeof metadata.status === "string"
      ? metadata.status
      : "";
  return legacyStatusEvents[status] ?? null;
}

function resolveDetailKind(
  eventKey: BookingEventKey,
  metadata: Record<string, unknown>,
): BookingEventDetailKind {
  if (metadata.detail_kind === "user_text" || metadata.detail_kind === "system") {
    return metadata.detail_kind;
  }
  if (userDetailEvents.has(eventKey)) return "user_text";
  if (eventKey === "booking.initial_quote_submitted") {
    return typeof metadata.quote_message === "string" && metadata.quote_message.trim()
      ? "user_text"
      : "system";
  }
  if (eventKey === "booking.final_quote_submitted") {
    return typeof metadata.final_quote_message === "string" && metadata.final_quote_message.trim()
      ? "user_text"
      : "system";
  }
  return "system";
}

function formatVisitFeeTitle(metadata: Record<string, unknown>, language: AppLanguage) {
  const amount = Number(metadata.visit_fee_amount);
  if (!Number.isFinite(amount)) return templates["booking.initial_quote_submitted"].title[language];
  const currency = typeof metadata.currency === "string" ? metadata.currency : "TRY";
  const formatted = new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-GB", {
    style: "currency",
    currency,
  }).format(amount);
  return language === "tr"
    ? `Hizmet sağlayıcı teklif gönderdi: ziyaret ücreti ${formatted}`
    : `Provider submitted a quote: visit fee ${amount.toFixed(2)} ${currency}`;
}

export function bookingEventCopy(
  message: Pick<ChatMessage, "message_type" | "metadata">,
  language: AppLanguage,
) {
  const metadata = message.metadata ?? {};
  const rawTitle = typeof metadata.title === "string" ? metadata.title : "";
  const rawDetail = typeof metadata.detail === "string" ? metadata.detail : "";
  const eventKey = resolveEventKey(message);

  if (!eventKey) {
    return {
      eventKey: null,
      title: rawTitle || (language === "tr" ? "Rezervasyon güncellendi" : "Booking updated"),
      detail: rawDetail,
    };
  }

  const template = templates[eventKey];
  const detailKind = resolveDetailKind(eventKey, metadata);
  const title = language === "en" && rawTitle
    ? rawTitle
    : eventKey === "booking.initial_quote_submitted"
      ? formatVisitFeeTitle(metadata, language)
      : template.title[language];
  const detail = detailKind === "user_text"
    ? rawDetail
    : language === "en" && rawDetail
      ? rawDetail
      : template.detail?.[language] ?? "";

  return { eventKey, title, detail, detailKind };
}

export function bookingEventPreview(
  message: Pick<ChatMessage, "message_type" | "metadata">,
  language: AppLanguage,
) {
  const copy = bookingEventCopy(message, language);
  return `[${language === "tr" ? "rezervasyon" : "booking"}] ${copy.title}`;
}

export function localizeKnownBookingSystemText(text: string, language: AppLanguage) {
  if (language === "en") return text;
  return knownSystemText[text] ?? text;
}
