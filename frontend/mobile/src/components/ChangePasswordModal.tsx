import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, type } from "../theme/theme";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { TextField } from "./TextField";

type ChangePasswordModalProps = {
  visible: boolean;
  isSubmitting?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onSubmit: (passwords: { currentPassword: string; newPassword: string }) => void;
};

/**
 * Three password fields are not something a settings page should carry open.
 * They sit behind the row that asks for them, which also means the fields are
 * empty every time the sheet opens rather than holding what was typed before.
 */
export function ChangePasswordModal({
  visible,
  isSubmitting = false,
  errorMessage = "",
  onCancel,
  onSubmit,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (visible) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setLocalError("");
    }
  }, [visible]);

  function handleSubmit() {
    if (newPassword.length < 8) {
      setLocalError("The new password needs at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError("The new passwords do not match.");
      return;
    }

    setLocalError("");
    onSubmit({ currentPassword, newPassword });
  }

  const shownError = localError || errorMessage;

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.description}>
            Other devices are signed out and will need the new password.
          </Text>

          <TextField
            label="Current password"
            onChangeText={setCurrentPassword}
            placeholder="Your current password"
            secureTextEntry
            value={currentPassword}
          />
          <TextField
            label="New password"
            onChangeText={setNewPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry
            value={newPassword}
          />
          <TextField
            label="Confirm new password"
            onChangeText={setConfirmPassword}
            placeholder="Repeat the new password"
            secureTextEntry
            value={confirmPassword}
          />

          {shownError ? <Text style={styles.error}>{shownError}</Text> : null}

          <View style={styles.actions}>
            <PrimaryButton
              disabled={!currentPassword || !newPassword || !confirmPassword}
              isLoading={isSubmitting}
              label="Update password"
              onPress={handleSubmit}
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
