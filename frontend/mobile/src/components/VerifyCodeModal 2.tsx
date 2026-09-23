import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { TextField } from "./TextField";

/**
 * WS-85. The shared demo verification step: any six digits are accepted, which
 * is what the backend enforces too. Used by email and phone verification and by
 * the change-email flow (WS-88), so the wording and the rule live in one place.
 */
export const VERIFY_CODE_HINT = "Enter any 6 digits. Demo only.";

const SIX_DIGITS = /^\d{6}$/;

type VerifyCodeModalProps = {
  visible: boolean;
  title: string;
  description: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onSubmit: (code: string) => void;
};

export function VerifyCodeModal({
  visible,
  title,
  description,
  isSubmitting = false,
  errorMessage = "",
  onCancel,
  onSubmit,
}: VerifyCodeModalProps) {
  const [code, setCode] = useState("");

  // Reopening the modal should never show the previous attempt.
  useEffect(() => {
    if (visible) {
      setCode("");
    }
  }, [visible]);

  const isComplete = SIX_DIGITS.test(code);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <TextField
            keyboardType="number-pad"
            label="Verification code"
            maxLength={6}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, ""))}
            placeholder="123456"
            value={code}
          />
          <Text style={styles.hint}>{VERIFY_CODE_HINT}</Text>

          {errorMessage ? (
            <Text style={styles.error}>{errorMessage}</Text>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              disabled={!isComplete}
              isLoading={isSubmitting}
              label="Confirm"
              onPress={() => onSubmit(code)}
            />
            <SecondaryButton label="Cancel" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  description: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
