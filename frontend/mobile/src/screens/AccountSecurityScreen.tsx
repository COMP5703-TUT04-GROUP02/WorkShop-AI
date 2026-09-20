import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { changeEmail, changePassword, verifyEmail, verifyPhone } from "../api/auth";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { SecondaryButton } from "../components/SecondaryButton";
import { TextField } from "../components/TextField";
import { VERIFY_CODE_HINT, VerifyCodeModal } from "../components/VerifyCodeModal";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme/theme";
import { getErrorMessage } from "../utils/errors";

/**
 * WS-85 and WS-88. One security screen for customers and providers:
 * demo verification for email and phone, change password, change email.
 *
 * Every write goes through the WS-84 endpoints, which return the updated user,
 * so the status shown here comes from the server rather than local guessing.
 */
type PendingAction = "none" | "verify-email" | "verify-phone" | "change-email";

export function AccountSecurityScreen() {
  const { user, setCurrentUser, signIn } = useAuth();

  const [pending, setPending] = useState<PendingAction>("none");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [verifyMessage, setVerifyMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  function closeCodeModal() {
    setPending("none");
    setCodeError("");
    setIsSubmittingCode(false);
  }

  async function handleCodeSubmit(code: string) {
    setIsSubmittingCode(true);
    setCodeError("");

    try {
      if (pending === "change-email") {
        const updated = await changeEmail({ newEmail: newEmail.trim(), code });
        setCurrentUser(updated);
        setNewEmail("");
        setEmailMessage(`Sign-in email changed to ${updated.email}.`);
        closeCodeModal();
        return;
      }

      const updated =
        pending === "verify-phone" ? await verifyPhone(code) : await verifyEmail(code);
      setCurrentUser(updated);
      setVerifyMessage(
        pending === "verify-phone" ? "Phone verified." : "Email verified.",
      );
      closeCodeModal();
    } catch (error) {
      setCodeError(getErrorMessage(error));
      setIsSubmittingCode(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError("");
    setPasswordMessage("");

    if (newPassword.length < 8) {
      setPasswordError("The new password needs at least 8 characters.");
      return;
    }

    // Checked here as well so a typo never costs a round trip.
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const updated = await changePassword({ currentPassword, newPassword });

      // The backend revokes every refresh token, which would drop this session
      // a moment later. Signing in again with the new password keeps the user
      // where they are instead of bouncing them to the sign-in screen.
      await signIn(updated.email, newPassword);

      setCurrentUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(
        "Password changed. Other devices are signed out and will need the new password.",
      );
    } catch (error) {
      setPasswordError(getErrorMessage(error));
    } finally {
      setIsChangingPassword(false);
    }
  }

  function handleStartEmailChange() {
    setEmailError("");
    setEmailMessage("");

    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Enter the new email address first.");
      return;
    }

    setPending("change-email");
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Account and Security</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Sign-in email</Text>
            <Text style={styles.value}>{user?.email ?? "—"}</Text>
          </View>
          <StatusPill verified={Boolean(user?.email_verified)} />
        </View>
        <SecondaryButton
          label={user?.email_verified ? "Verify email again" : "Verify email"}
          onPress={() => {
            setVerifyMessage("");
            setPending("verify-email");
          }}
        />

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.hint}>
              Verifies the number saved on your profile.
            </Text>
          </View>
          <StatusPill verified={Boolean(user?.phone_verified)} />
        </View>
        <SecondaryButton
          label={user?.phone_verified ? "Verify phone again" : "Verify phone"}
          onPress={() => {
            setVerifyMessage("");
            setPending("verify-phone");
          }}
        />

        {verifyMessage ? <Text style={styles.success}>{verifyMessage}</Text> : null}
        <Text style={styles.hint}>{VERIFY_CODE_HINT}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Change password</Text>
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
        {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
        {passwordMessage ? (
          <Text style={styles.success}>{passwordMessage}</Text>
        ) : null}
        <PrimaryButton
          disabled={!currentPassword || !newPassword || !confirmPassword}
          isLoading={isChangingPassword}
          label="Update password"
          onPress={() => void handleChangePassword()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Change sign-in email</Text>
        <Text style={styles.hint}>
          We ask for a 6-digit code to confirm the change, the same demo code as
          verification.
        </Text>
        <TextField
          keyboardType="email-address"
          label="New email"
          onChangeText={setNewEmail}
          placeholder="you@example.com"
          value={newEmail}
        />
        {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
        {emailMessage ? <Text style={styles.success}>{emailMessage}</Text> : null}
        <PrimaryButton
          disabled={!newEmail.trim()}
          label="Send code"
          onPress={handleStartEmailChange}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign-in method</Text>
        <Text style={styles.value}>Email and password</Text>
        <Text style={styles.hint}>
          Google and Apple sign-in are on the sign-in screen as a reminder. OAuth is
          not connected yet.
        </Text>
      </View>

      <VerifyCodeModal
        description={
          pending === "change-email"
            ? `Enter the code to confirm ${newEmail.trim()} as your sign-in email.`
            : pending === "verify-phone"
              ? "Enter the code sent to the phone number on your profile."
              : `Enter the code sent to ${user?.email ?? "your email"}.`
        }
        errorMessage={codeError}
        isSubmitting={isSubmittingCode}
        onCancel={closeCodeModal}
        onSubmit={(code) => void handleCodeSubmit(code)}
        title={pending === "change-email" ? "Confirm new email" : "Verify"}
        visible={pending !== "none"}
      />
    </ScreenContainer>
  );
}

function StatusPill({ verified }: { verified: boolean }) {
  return (
    <View style={[styles.pill, verified ? styles.pillVerified : null]}>
      <Text style={styles.pillText}>{verified ? "VERIFIED" : "NOT VERIFIED"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  pill: {
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillVerified: {
    backgroundColor: "#E7F6F0",
  },
  pillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
