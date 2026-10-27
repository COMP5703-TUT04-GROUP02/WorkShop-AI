const assert = require("node:assert/strict");
const test = require("node:test");

const { notificationCopy } = require("../../../.test-build/i18n/notificationTemplates.js");
const { translateText } = require("../../../.test-build/i18n/translations.js");
const { accessibilityCopy } = require("../../../.test-build/i18n/accessibility.js");
const {
  bookingEventCopy,
  bookingEventPreview,
} = require("../../../.test-build/i18n/bookingEvents.js");

const base = {
  id: 1,
  user_id: 1,
  title: "Original title",
  content: "Original content",
  notification_type: "chat_message_received",
  related_type: "chat_room",
  related_id: 1,
  read_at: null,
  created_at: "2026-10-26T00:00:00Z",
};

test("English stays unchanged and Turkish translates app copy", () => {
  assert.equal(translateText("en", "Sign in"), "Sign in");
  assert.equal(translateText("tr", "Sign in"), "Giriş yap");
});

test("legacy notifications keep their stored text", () => {
  assert.deepEqual(notificationCopy(base, "tr"), {
    title: "Original title",
    content: "Original content",
  });
});

test("new notifications use current language and retain original parameters", () => {
  const notification = {
    ...base,
    template_key: "provider_portfolio_rejected",
    template_params: { title: "Bosphorus Repair", reason: "Needs a clearer photo" },
  };
  assert.deepEqual(notificationCopy(notification, "en"), {
    title: "Original title",
    content: "Original content",
  });
  const turkish = notificationCopy(notification, "tr");
  assert.match(turkish.content, /Bosphorus Repair/);
  assert.match(turkish.content, /Needs a clearer photo/);
  assert.match(turkish.content, /reddedildi/);
});

test("chat attachment count is localized", () => {
  const notification = {
    ...base,
    template_key: "chat_message_received",
    template_params: { sender_role: "provider", attachment_count: 2 },
  };
  assert.match(notificationCopy(notification, "tr").content, /2 ek/);
});

test("accessibility actions translate while preserving IDs and user names", () => {
  assert.equal(accessibilityCopy("tr", "View booking #12 details"), "#12 numaralı rezervasyonun ayrıntılarını görüntüle");
  assert.equal(accessibilityCopy("tr", "Remove Bosphorus Repair from favourites"), "Bosphorus Repair adlı sağlayıcıyı favorilerden kaldır");
  assert.equal(accessibilityCopy("tr", "Notifications, 3 unread"), "Bildirimler, 3 okunmamış");
  assert.equal(accessibilityCopy("en", "View booking #12 details"), "View booking #12 details");
});

test("booking events preserve stored English system copy", () => {
  const message = {
    message_type: "booking_status",
    metadata: {
      event_key: "booking.visit_started",
      detail_kind: "system",
      title: "Provider started the visit",
      detail: "Provider arrived and submitted visit evidence",
    },
  };

  assert.deepEqual(bookingEventCopy(message, "en"), {
    eventKey: "booking.visit_started",
    title: "Provider started the visit",
    detail: "Provider arrived and submitted visit evidence",
    detailKind: "system",
  });
  assert.match(bookingEventPreview(message, "en"), /^\[booking\]/);
});

test("known booking system events are rendered in Turkish", () => {
  const message = {
    message_type: "booking_status",
    metadata: {
      event_key: "booking.visit_fee_paid",
      detail_kind: "system",
      title: "Customer paid the visit fee; provider can start the visit",
      detail: "Visit fee paid; provider must submit arrival evidence",
    },
  };

  const copy = bookingEventCopy(message, "tr");
  assert.match(copy.title, /ziyaret ücretini ödedi/);
  assert.match(copy.detail, /varış kanıtı/);
  assert.match(bookingEventPreview(message, "tr"), /^\[rezervasyon\]/);
});

test("legacy booking messages use status fallback without rewriting storage", () => {
  const message = {
    message_type: "booking_status",
    metadata: {
      new_status: "awaiting_service_payment",
      title: "Customer accepted the final quote",
      detail: "Customer accepted the final quote and is waiting to pay",
    },
  };

  assert.match(bookingEventCopy(message, "tr").title, /nihai teklifi kabul etti/);
  assert.equal(message.metadata.title, "Customer accepted the final quote");
});

test("user-authored booking event details remain verbatim in Turkish", () => {
  const message = {
    message_type: "booking_status",
    metadata: {
      event_key: "booking.final_quote_rejected",
      detail_kind: "user_text",
      title: "Customer declined the final quote",
      detail: "Fiyat bütçemi aşıyor / above my budget",
    },
  };

  assert.equal(
    bookingEventCopy(message, "tr").detail,
    "Fiyat bütçemi aşıyor / above my budget",
  );
});

test("quote titles retain amount parameters and unknown copy falls back safely", () => {
  const quote = bookingEventCopy({
    message_type: "booking_status",
    metadata: {
      event_key: "booking.initial_quote_submitted",
      detail_kind: "system",
      visit_fee_amount: 22,
      currency: "TRY",
    },
  }, "tr");
  assert.match(quote.title, /22/);

  const unknown = bookingEventCopy({
    message_type: "booking_status",
    metadata: { title: "Custom legacy event", detail: "Keep this text" },
  }, "tr");
  assert.equal(unknown.title, "Custom legacy event");
  assert.equal(unknown.detail, "Keep this text");
});
