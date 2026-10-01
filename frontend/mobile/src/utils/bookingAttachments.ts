import type { BookingAttachment, BookingAttachmentPurpose } from "../types/booking";

const sections: { purpose: BookingAttachmentPurpose; title: string }[] = [
  { purpose: "customer_attachment", title: "Customer attachments" },
  { purpose: "arrival_evidence", title: "Arrival evidence" },
  { purpose: "completion_proof", title: "Completion proof" },
];

export function getBookingAttachmentSections(attachments: BookingAttachment[] = []) {
  return sections.map((section) => ({
    ...section,
    attachments: attachments.filter((attachment) => attachment.purpose === section.purpose),
  }));
}
