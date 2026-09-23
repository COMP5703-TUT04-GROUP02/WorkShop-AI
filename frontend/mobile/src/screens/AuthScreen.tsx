import { useNavigation } from "@react-navigation/native";
import { Check, MapPin } from "lucide-react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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

import { LocationPickerModal } from "../components/LocationPickerModal";
import { PrimaryButton } from "../components/PrimaryButton";
import { RoleSegmentedControl } from "../components/RoleSegmentedControl";
import { SecondaryButton } from "../components/SecondaryButton";
import { TextField } from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme/theme";
import {
  createCustomerAddress,
  patchCustomerProfile,
} from "../api/customer";
import type { RegisterRequest } from "../types/auth";
import type { SelectedLocation } from "../types/location";
import { getErrorMessage } from "../utils/errors";
import { notifyUser } from "../utils/notify";
import { savePendingProviderPlace } from "../utils/pendingProviderPlace";

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
  const [serviceLocation, setServiceLocation] = useState<SelectedLocation | null>(null);
  const [isLocationPickerVisible, setIsLocationPickerVisible] = useState(false);
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

  // WS-92. Checked here as well as on the server so a typo or an unticked box
  // never costs a round trip, and the message points at the field to fix.
  function findRegisterProblem() {
    if (!firstName.trim() || !lastName.trim()) {
      return "Enter your first name and last name.";
    }

    if (password !== confirmPassword) {
      return "The passwords do not match.";
    }

    if (!termsAccepted) {
      return "Please accept the Terms of Use to continue.";
    }

    // WS-99: a device fix is not a recommended place, and the address book
    // needs the place_id that only a chosen suggestion carries.
    if (!serviceLocation?.placeId) {
      return "Pick your service location from the suggestions.";
    }

    return "";
  }

  /**
   * WS-99. /register takes no location, so the chosen place is stored right
   * after sign-up. It never fails the registration — the account exists and
   * the user is already signed in by now — but it does not pass silently
   * either: the register screen is gone at this point, so a failure is told
   * in a dialog instead of a message nobody would see.
   */
  async function keepChosenPlace(userId: number, place: SelectedLocation) {
    if (!place.placeId) {
      return;
    }

    if (role === "provider") {
      // A provider profile does not exist yet, so the place waits on this
      // device until the profile form sends it as address and coordinates.
      try {
        await savePendingProviderPlace(userId, {
          address: place.label,
          latitude: place.latitude,
          longitude: place.longitude,
        });
      } catch {
        notifyUser(
          "Address not kept",
          `We could not keep ${place.label} on this device. Search for it again on the provider profile form.`,
        );
      }

      return;
    }

    try {
      await createCustomerAddress({
        label: "Home",
        place_id: place.placeId,
        formatted_address: place.label,
        latitude: place.latitude,
        longitude: place.longitude,
        is_default: true,
      });
    } catch (error) {
      notifyUser(
        "Address not saved",
        `Your account is ready, but ${place.label} was not added to your address book.\n\n${getErrorMessage(error)}`,
      );

      return;
    }

    // Search measures distance from the profile's default service point, so
    // the same place is written there as well.
    try {
      await patchCustomerProfile({
        default_service_address: place.label,
        default_service_latitude: place.latitude,
        default_service_longitude: place.longitude,
      });
    } catch (error) {
      notifyUser(
        "Default service location not set",
        `${place.label} is in your address book, but it is not your default service location yet, so search results are not measured from it.\n\n${getErrorMessage(error)}`,
      );
    }
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

        const newUser = await signUp({
          first_name: first,
          last_name: last,
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          tos_accepted: termsAccepted,
          role,
          // Names are stored as typed: FDS C-R05 says not to uppercase on save.
          name: `${first} ${last}`.trim(),
        });

        if (serviceLocation?.placeId) {
          await keepChosenPlace(newUser.id, serviceLocation);
        }
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
            <TextField
              label="Confirm password"
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry
              value={confirmPassword}
            />
          ) : null}

          {isRegisterMode ? (
            <View style={styles.roleBlock}>
              <Text style={styles.fieldLabel}>Service location</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsLocationPickerVisible(true)}
                style={({ pressed }) => [
                  styles.locationButton,
                  pressed ? styles.locationButtonPressed : null,
                ]}
              >
                <MapPin color={colors.mutedText} size={18} />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.locationText,
                    serviceLocation ? null : styles.locationPlaceholder,
                  ]}
                >
                  {serviceLocation?.label ?? "Search for your address"}
                </Text>
              </Pressable>
            </View>
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

      <LocationPickerModal
        onClose={() => setIsLocationPickerVisible(false)}
        onConfirm={(next) => {
          setServiceLocation(next);
          setIsLocationPickerVisible(false);
          setErrorMessage("");
        }}
        requirePlaceId
        value={serviceLocation}
        visible={isLocationPickerVisible}
      />
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
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
  },
  locationButtonPressed: {
    backgroundColor: colors.surface,
  },
  locationText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  locationPlaceholder: {
    color: colors.mutedText,
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
