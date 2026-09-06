import { Modal, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../theme/theme";
import type { BookingPayload } from "../types/booking";
import type { ProviderProfile } from "../types/provider";
import { formatDateTimeInput } from "../utils/datetime";
import { DateTimeField } from "./DateTimeField";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { TextField } from "./TextField";

export type BookingRequestFormState = {
  serviceDescription: string;
  serviceAddress: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
};

type BookingRequestModalProps = {
  visible: boolean;
  bookingForm: BookingRequestFormState;
  errorMessage: string;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  setBookingForm: (value: BookingRequestFormState) => void;
};

const ISTANBUL_LOCATION = {
  latitude: 41.0082,
  longitude: 28.9784,
};

export function BookingRequestModal({
  visible,
  bookingForm,
  errorMessage,
  isLoading,
  onClose,
  onSubmit,
  setBookingForm,
}: BookingRequestModalProps) {
  function updateFormField(field: keyof BookingRequestFormState, value: string) {
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
      visible={visible}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Request booking</Text>
          {errorMessage ? (
            <Text style={styles.modalErrorText}>{errorMessage}</Text>
          ) : null}
          <TextField
            label="Service description"
            multiline
            numberOfLines={3}
            onChangeText={(value) => updateFormField("serviceDescription", value)}
            placeholder="e.g. Kitchen pipe leak"
            value={bookingForm.serviceDescription}
          />
          <TextField
            label="Service address"
            onChangeText={(value) => updateFormField("serviceAddress", value)}
            placeholder="Address"
            value={bookingForm.serviceAddress}
          />
          <DateTimeField
            label="Start time"
            onChange={(value) => updateFormField("scheduledStartTime", value)}
            value={bookingForm.scheduledStartTime}
          />
          <DateTimeField
            label="End time"
            onChange={(value) => updateFormField("scheduledEndTime", value)}
            value={bookingForm.scheduledEndTime}
          />
          <View style={styles.modalActions}>
            <SecondaryButton disabled={isLoading} label="Cancel" onPress={onClose} />
            <PrimaryButton
              disabled={isLoading}
              isLoading={isLoading}
              label="Send request"
              onPress={onSubmit}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function createDefaultBookingRequestForm(
  provider?: ProviderProfile | null,
): BookingRequestFormState {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setHours(12, 0, 0, 0);

  return {
    serviceDescription: "",
    serviceAddress: provider?.address || "Istanbul",
    scheduledStartTime: formatDateTimeInput(start),
    scheduledEndTime: formatDateTimeInput(end),
  };
}

export function buildBookingRequestPayload({
  provider,
  providerProfileId,
  chatRoomId,
  form,
}: {
  provider?: ProviderProfile | null;
  providerProfileId: number;
  chatRoomId?: number | null;
  form: BookingRequestFormState;
}): BookingPayload | null {
  if (
    !form.serviceDescription.trim() ||
    !form.serviceAddress.trim() ||
    !form.scheduledStartTime.trim() ||
    !form.scheduledEndTime.trim()
  ) {
    return null;
  }

  return {
    provider_profile_id: providerProfileId,
    chat_room_id: chatRoomId ?? null,
    service_description: form.serviceDescription.trim(),
    service_address: form.serviceAddress.trim(),
    service_latitude: provider?.latitude ?? ISTANBUL_LOCATION.latitude,
    service_longitude: provider?.longitude ?? ISTANBUL_LOCATION.longitude,
    customer_current_address: null,
    customer_current_latitude: null,
    customer_current_longitude: null,
    scheduled_start_time: form.scheduledStartTime.trim(),
    scheduled_end_time: form.scheduledEndTime.trim(),
  };
}

const styles = StyleSheet.create({
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
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
