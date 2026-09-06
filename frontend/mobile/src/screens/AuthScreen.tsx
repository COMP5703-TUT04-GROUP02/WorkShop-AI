import { useState } from "react";
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

import { PrimaryButton } from "../components/PrimaryButton";
import { RoleSegmentedControl } from "../components/RoleSegmentedControl";
import { SecondaryButton } from "../components/SecondaryButton";
import { TextField } from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import { colors, radius, spacing } from "../theme/theme";
import type { RegisterRequest } from "../types/auth";
import { getErrorMessage } from "../utils/errors";

type AuthMode = "login" | "register";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RegisterRequest["role"]>("customer");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegisterMode = mode === "register";
  const isWebDesktop = useIsWebDesktop();

  function toggleMode() {
    setMode(isRegisterMode ? "login" : "register");
    setErrorMessage("");
  }

  function showSocialLoginTodo(provider: "Google" | "Apple") {
    Alert.alert(
      `${provider} sign-in is not implemented`,
      "This button is a reminder to connect OAuth. Use email and password for the demo.",
    );
  }

  async function handleSubmit() {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      if (isRegisterMode) {
        await signUp({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
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
      style={[styles.keyboardView, isWebDesktop ? styles.keyboardViewDesktop : null]}
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
            <TextField
              autoCapitalize="words"
              label="Name"
              onChangeText={setName}
              placeholder="Your name"
              value={name}
            />
          ) : null}

          <TextField
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />

          <TextField
            label="Password"
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry
            value={password}
          />

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
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
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
});
