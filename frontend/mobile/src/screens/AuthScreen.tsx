import { useNavigation } from "@react-navigation/native";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { sendRegisterEmailCode } from "../api/auth";
import { PrimaryButton } from "../components/PrimaryButton";
import { RoleSegmentedControl } from "../components/RoleSegmentedControl";
import { SecondaryButton } from "../components/SecondaryButton";
import { TextField } from "../components/TextField";
import { EMAIL_CODE_HINT } from "../components/VerifyCodeModal";
import { useAuth } from "../context/AuthContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme/theme";
import type { RegisterRequest } from "../types/auth";
import { getErrorMessage } from "../utils/errors";

type AuthMode = "login" | "register";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<AuthMode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [role, setRole] = useState<RegisterRequest["role"]>("customer");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Sign-up proves the email first: a code is mailed to it and must be
  // entered before the account is created.
  const [emailCode, setEmailCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [codeMessage, setCodeMessage] = useState("");

  const isRegisterMode = mode === "register";
  const isWebDesktop = useIsWebDesktop();
  // This screen has no header, so keep the form clear of the status bar,
  // notch and home indicator. Insets are zero on web.
  const insets = useSafeAreaInsets();
  const normalizedEmail = email.trim().toLowerCase();
  // Editing the address after a code went out means the code no longer fits.
  const hasCodeForEmail = codeSentTo !== "" && codeSentTo === normalizedEmail;

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function toggleMode() {
    setMode(isRegisterMode ? "login" : "register");
    setErrorMessage("");
    setCodeMessage("");
  }

  async function handleSendCode() {
    setErrorMessage("");
    setCodeMessage("");

    if (!normalizedEmail.includes("@")) {
      setErrorMessage("Enter your email address first.");
      return;
    }

    setIsSendingCode(true);
    try {
      const sent = await sendRegisterEmailCode(normalizedEmail);
      setCodeSentTo(sent.sent_to);
      setEmailCode("");
      setResendIn(sent.resend_after_seconds);
      setCodeMessage(`We sent a 6-digit code to ${sent.sent_to}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSendingCode(false);
    }
  }

  function showSocialLoginTodo(provider: "Google" | "Apple") {
    Alert.alert(
      `${provider} sign-in is not implemented`,
      "This button is a reminder to connect OAuth. Use email and password for the demo.",
    );
  }

  // WS-92. Checked here as well as on the server so a typo or an unticked box
  // never costs a round trip, and the message points at the field to fix.
  function findRegisterProblem() {
    if (!firstName.trim() || !lastName.trim()) {
      return "Enter your first name and last name.";
    }

    if (!hasCodeForEmail) {
      return "Tap Send code to get a verification code for your email.";
    }

    if (!/^\d{6}$/.test(emailCode)) {
      return "Enter the 6-digit code from your email.";
    }

    if (password !== confirmPassword) {
      return "The passwords do not match.";
    }

    if (!termsAccepted) {
      return "Please accept the Terms of Use to continue.";
    }

    return "";
  }

  async function handleSubmit() {
    setErrorMessage("");

    if (isRegisterMode) {
      const problem = findRegisterProblem();

      if (problem) {
        setErrorMessage(problem);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isRegisterMode) {
        const first = firstName.trim();
        const last = lastName.trim();

        await signUp({
          first_name: first,
          last_name: last,
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          tos_accepted: termsAccepted,
          role,
          email_code: emailCode,
          // Names are stored as typed: FDS C-R05 says not to uppercase on save.
          name: `${first} ${last}`.trim(),
        });
      } else {
        await signIn(email.trim(), password);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[
        styles.keyboardView,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        isWebDesktop ? styles.keyboardViewDesktop : null,
      ]}
    >
      {isWebDesktop ? (
        <View style={styles.hero}>
          <Text style={styles.heroBrand}>Workshop AI</Text>
          <Text style={styles.heroTitle}>Find local service providers</Text>
          <Text style={styles.heroSubtitle}>
            Search listings, request quotes, book appointments, and leave reviews.
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWebDesktop ? styles.scrollContentDesktop : null,
        ]}
        keyboardShouldPersistTaps="handled"
        style={isWebDesktop ? styles.scrollDesktop : undefined}
      >
        <View style={styles.header}>
          {isWebDesktop ? null : <Text style={styles.brand}>Workshop AI</Text>}
          <Text style={styles.title}>
            {isRegisterMode ? "Create an account" : "Welcome back"}
          </Text>
          <Text style={styles.subtitle}>
            {isRegisterMode
              ? "Select a role to continue."
              : "Sign in to manage chats, bookings, and requests."}
          </Text>
        </View>

        <View style={[styles.form, isWebDesktop ? styles.formDesktop : null]}>
          {isRegisterMode ? (
            <>
              <TextField
                autoCapitalize="words"
                label="First name"
                onChangeText={setFirstName}
                placeholder="Your first name"
                value={firstName}
              />
              <TextField
                autoCapitalize="words"
                label="Last name"
                onChangeText={setLastName}
                placeholder="Your last name"
                value={lastName}
              />
            </>
          ) : null}

          {isRegisterMode ? (
            <View style={styles.emailCodeBlock}>
              <View style={styles.emailRow}>
                <View style={styles.emailField}>
                  <TextField
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    value={email}
                  />
                </View>
                <SecondaryButton
                  disabled={isSendingCode || (hasCodeForEmail && resendIn > 0)}
                  label={
                    isSendingCode
                      ? "Sending..."
                      : !hasCodeForEmail
                        ? "Send code"
                        : resendIn > 0
                          ? `Resend (${resendIn}s)`
                          : "Resend"
                  }
                  onPress={() => void handleSendCode()}
                  style={styles.sendCodeButton}
                />
              </View>
              {hasCodeForEmail ? (
                <>
                  <TextField
                    keyboardType="number-pad"
                    label="Email verification code"
                    maxLength={6}
                    onChangeText={(value) => setEmailCode(value.replace(/[^0-9]/g, ""))}
                    placeholder="123456"
                    value={emailCode}
                  />
                  {codeMessage ? (
                    <Text style={styles.codeHint}>{codeMessage}</Text>
                  ) : null}
                  <Text style={styles.codeHint}>{EMAIL_CODE_HINT}</Text>
                </>
              ) : null}
            </View>
          ) : (
            <TextField
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="you@example.com"
              value={email}
            />
          )}

          <TextField
            label="Password"
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry
            value={password}
          />

          {isRegisterMode ? (
            <TextField
              label="Confirm password"
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry
              value={confirmPassword}
            />
          ) : null}

          {isRegisterMode ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              onPress={() => setTermsAccepted((accepted) => !accepted)}
              style={styles.termsRow}
            >
              <View style={[styles.checkbox, termsAccepted ? styles.checkboxChecked : null]}>
                {termsAccepted ? <Check color="#FFFFFF" size={14} /> : null}
              </View>
              <Text style={styles.termsText}>
                I accept the{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() => navigation.navigate("Legal", { document: "terms" })}
                  style={styles.termsLink}
                >
                  Terms of Use
                </Text>{" "}
                and the{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() => navigation.navigate("Legal", { document: "privacy" })}
                  style={styles.termsLink}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </Pressable>
          ) : null}

          {isRegisterMode ? (
            <View style={styles.roleBlock}>
              <Text style={styles.fieldLabel}>Role</Text>
              <RoleSegmentedControl onChange={setRole} value={role} />
            </View>
          ) : null}

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <PrimaryButton
            isLoading={isSubmitting}
            label={isRegisterMode ? "Create account" : "Sign in"}
            onPress={handleSubmit}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialButtons}>
            <SecondaryButton
              label="Continue with Google"
              onPress={() => showSocialLoginTodo("Google")}
            />
            <SecondaryButton
              label="Continue with Apple"
              onPress={() => showSocialLoginTodo("Apple")}
            />
            <Text style={styles.socialHint}>To do: connect Google and Apple sign-in.</Text>
          </View>

          <Pressable onPress={toggleMode} style={styles.switchButton}>
            <Text style={styles.switchText}>
              {isRegisterMode
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </Text>
          </Pressable>
        </View>

        {/* WS-90. Signed-out entry to the legal pages. WS-92 adds the register
            checkbox that links to the same routes. */}
        <View style={styles.legalRow}>
          <Pressable
            accessibilityRole="link"
            hitSlop={6}
            onPress={() => navigation.navigate("Legal", { document: "privacy" })}
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable
            accessibilityRole="link"
            hitSlop={6}
            onPress={() => navigation.navigate("Legal", { document: "terms" })}
          >
            <Text style={styles.legalLink}>Terms of Use</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardViewDesktop: {
    flexDirection: "row",
    backgroundColor: colors.surface,
  },
  hero: {
    flex: 1.05,
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 64,
    paddingVertical: 48,
    gap: spacing.md,
  },
  heroBrand: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "700",
    lineHeight: 50,
    maxWidth: 460,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 18,
    lineHeight: 26,
    maxWidth: 420,
  },
  scrollDesktop: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  scrollContentDesktop: {
    paddingHorizontal: 56,
    paddingVertical: 48,
  },
  header: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brand: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  formDesktop: {
    maxWidth: 440,
  },
  roleBlock: {
    gap: spacing.sm,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emailCodeBlock: {
    gap: spacing.sm,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  emailField: {
    flex: 1,
  },
  sendCodeButton: {
    minHeight: 48,
    minWidth: 120,
  },
  codeHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  socialButtons: {
    gap: spacing.sm,
  },
  socialHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  switchButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  switchText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  legalLink: {
    color: colors.mutedText,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  legalDot: {
    color: colors.mutedText,
    fontSize: 13,
  },
});
