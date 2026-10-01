import type { BookingDetail } from "../types/booking";
import { getBookingAttachmentSections } from "../utils/bookingAttachments";
import { BookingAttachmentGallery } from "./BookingAttachmentGallery";

export function BookingAttachments({ booking }: { booking: BookingDetail }) {
  return (
    <>
      {getBookingAttachmentSections(booking.attachments).map((section) => (
        <BookingAttachmentGallery
          attachments={section.attachments}
          key={section.purpose}
          title={section.title}
        />
      ))}
    </>
  );
}
