import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, type } from "../theme/theme";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { TextField } from "./TextField";

type ChangeEmailModalProps = {
  visible: boolean;
  currentEmail: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onSubmit: (email: string) => void;
};

/**
 * The twin of ChangePasswordModal: the same reason, the same shape. Asking for
 * the new address only once it has been asked for keeps the settings page a
 * list of what is set rather than a stack of open forms.
 */
export function ChangeEmailModal({
  visible,
  currentEmail,
  isSubmitting = false,
  errorMessage = "",
  onCancel,
  onSubmit,
}: ChangeEmailModalProps) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (visible) {
      setEmail("");
    }
  }, [visible]);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Change sign-in email</Text>
          <Text style={styles.description}>
            We email a 6-digit code to the new address. The change takes effect
            once you enter it. You sign in with {currentEmail} until then.
          </Text>

          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            label="New email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            <PrimaryButton
              disabled={!email.trim()}
              isLoading={isSubmitting}
              label="Send code"
              onPress={() => onSubmit(email)}
            />
            <SecondaryButton
              disabled={isSubmitting}
              label="Cancel"
              onPress={onCancel}
            />
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
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
  },
  description: {
    color: colors.mutedText,
    fontSize: type.secondary,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: type.secondary,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
