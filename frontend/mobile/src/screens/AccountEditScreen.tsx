import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronDown } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getCustomerProfile, patchCustomerProfile } from "../api/customer";
import {
  getProviderProfile,
  patchProviderContactProfile,
} from "../api/provider";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProvincePickerModal } from "../components/ProvincePickerModal";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { colors, radius, spacing } from "../theme/theme";
import type { ProviderProfile } from "../types/provider";

const DEFAULT_SERVICE_PROVINCE = "Istanbul";

type AccountFormValues = {
  name: string;
  phoneNumber: string;
  address: string;
  serviceProvince: string;
  notes: string;
};

type MessageTone = "success" | "error";

function toFormValues(
  userName: string,
  profile?: {
    phone_number?: string | null;
    address?: string | null;
    service_province?: string | null;
    notes?: string | null;
  } | null,
): AccountFormValues {
  return {
    name: userName,
    phoneNumber: profile?.phone_number ?? "",
    address: profile?.address ?? "",
    serviceProvince: profile?.service_province || DEFAULT_SERVICE_PROVINCE,
    notes: profile?.notes ?? "",
  };
}

export function AccountEditScreen() {
  const { user, patchUserProfile } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState(user?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [serviceProvince, setServiceProvince] = useState(
    DEFAULT_SERVICE_PROVINCE,
  );
  const [notes, setNotes] = useState("");
  const [providerProfile, setProviderProfile] =
    useState<ProviderProfile | null>(null);
  const [isProvincePickerVisible, setIsProvincePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [initialValues, setInitialValues] = useState<AccountFormValues | null>(
    user ? toFormValues(user.name) : null,
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadProfile() {
        if (!user) {
          return;
        }

        setIsLoading(true);
        setMessage("");
        const fallbackValues = toFormValues(user.name);
        setName(fallbackValues.name);
        setPhoneNumber(fallbackValues.phoneNumber);
        setAddress(fallbackValues.address);
        setServiceProvince(fallbackValues.serviceProvince);
        setNotes(fallbackValues.notes);
        setInitialValues(fallbackValues);

        try {
          if (user.role === "customer") {
            const profile = await getCustomerProfile();

            if (isActive && profile) {
              const nextValues = toFormValues(user.name, profile);
              setPhoneNumber(nextValues.phoneNumber);
              setAddress(nextValues.address);
              setServiceProvince(nextValues.serviceProvince);
              setNotes(nextValues.notes);
              setInitialValues(nextValues);
            }
          }

          if (user.role === "provider") {
            const profile = await getProviderProfile();

            if (isActive && profile) {
              const nextValues = toFormValues(user.name, profile);
              setProviderProfile(profile);
              setPhoneNumber(nextValues.phoneNumber);
              setAddress(nextValues.address);
              setServiceProvince(nextValues.serviceProvince);
              setNotes(nextValues.notes);
              setInitialValues(nextValues);
            }
          }
        } catch {
          if (isActive) {
            setServiceProvince(DEFAULT_SERVICE_PROVINCE);
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }

      void loadProfile();

      return () => {
        isActive = false;
      };
    }, [user]),
  );

  async function handleSave() {
    if (!user || isSaving) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedPhone = phoneNumber.trim();
    const trimmedAddress = address.trim();
    const trimmedNotes = notes.trim();
    const currentValues = {
      name: trimmedName,
      phoneNumber: trimmedPhone,
      address: trimmedAddress,
      serviceProvince,
      notes: trimmedNotes,
    };
    const savedValues = initialValues ?? toFormValues(user.name);
    const phoneChanged =
      currentValues.phoneNumber !== savedValues.phoneNumber.trim();
    const addressChanged = currentValues.address !== savedValues.address.trim();
    const profilePatch: Parameters<typeof patchCustomerProfile>[0] = {};

    if (phoneChanged) {
      profilePatch.phone_number = currentValues.phoneNumber;
    }
    if (addressChanged) {
      profilePatch.address = currentValues.address;
    }
    if (currentValues.serviceProvince !== savedValues.serviceProvince) {
      profilePatch.service_province = currentValues.serviceProvince;
    }
    if (currentValues.notes !== savedValues.notes.trim()) {
      profilePatch.notes = currentValues.notes || null;
    }
    const hasProfilePatch = Object.keys(profilePatch).length > 0;

    if (
      !trimmedName ||
      (user.role !== "admin" &&
        ((phoneChanged && !trimmedPhone) ||
          (addressChanged && !trimmedAddress)))
    ) {
      setMessageTone("error");
      setMessage("Fill in the required fields.");
      return;
    }

    if (user.role === "provider" && !providerProfile && hasProfilePatch) {
      setMessageTone("error");
      setMessage("Create a provider profile first, then add contact details.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      if (currentValues.name !== savedValues.name.trim()) {
        await patchUserProfile({ name: currentValues.name });
      }

      if (user.role === "customer") {
        if (hasProfilePatch) {
          await patchCustomerProfile(profilePatch);
        }
      }

      if (user.role === "provider") {
        if (hasProfilePatch) {
          await patchProviderContactProfile(profilePatch);
        }
      }

      setMessageTone("success");
      setMessage("Profile saved");
      navigation.goBack();
    } catch {
      setMessageTone("error");
      setMessage("Couldn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.card}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <TextField
              label="Name"
              onChangeText={setName}
              placeholder="Your name"
              value={name}
            />

            {user?.role !== "admin" ? (
              <>
                <TextField
                  keyboardType="phone-pad"
                  label="Phone"
                  onChangeText={setPhoneNumber}
                  placeholder="Phone number"
                  value={phoneNumber}
                />
                <TextField
                  label="Address"
                  onChangeText={setAddress}
                  placeholder="Address"
                  value={address}
                />

                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Service province</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIsProvincePickerVisible(true)}
                    style={styles.provinceButton}
                  >
                    <Text style={styles.provinceText}>{serviceProvince}</Text>
                    <ChevronDown color={colors.mutedText} size={20} />
                  </Pressable>
                </View>

                <TextField
                  label="Notes"
                  multiline
                  numberOfLines={4}
                  onChangeText={setNotes}
                  placeholder="Notes or preferences"
                  value={notes}
                />
              </>
            ) : null}

            {user?.role === "provider" && !providerProfile ? (
              <Text style={styles.hintText}>
                Create a provider profile first, then add contact details.
              </Text>
            ) : null}

            {message ? (
              <Text
                style={[
                  styles.messageText,
                  messageTone === "success"
                    ? styles.successMessageText
                    : styles.errorMessageText,
                ]}
              >
                {message}
              </Text>
            ) : null}

            <PrimaryButton
              disabled={isSaving}
              label={isSaving ? "Saving..." : "Save"}
              onPress={() => void handleSave()}
            />
          </>
        )}
      </View>

      <ProvincePickerModal
        onClose={() => setIsProvincePickerVisible(false)}
        onSelect={(province) => {
          setServiceProvince(province);
          setIsProvincePickerVisible(false);
        }}
        value={serviceProvince}
        visible={isProvincePickerVisible}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
  },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  loadingBox: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  provinceButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  provinceText: {
    color: colors.text,
    fontSize: 16,
  },
  hintText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  messageText: {
    fontSize: 13,
  },
  successMessageText: {
    color: colors.primary,
  },
  errorMessageText: {
    color: colors.danger,
  },
});
