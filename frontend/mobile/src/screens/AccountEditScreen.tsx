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

import {
  getCustomerProfile,
  updateCustomerProfile,
} from "../api/customer";
import {
  getProviderProfile,
  updateProviderContactProfile,
} from "../api/provider";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProvincePickerModal } from "../components/ProvincePickerModal";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { colors, radius, spacing } from "../theme/theme";
import type { CustomerProfile } from "../types/customer";
import type { ProviderProfile } from "../types/provider";

const DEFAULT_SERVICE_PROVINCE = "Istanbul";

export function AccountEditScreen() {
  const { user, updateUserProfile } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState(user?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [serviceProvince, setServiceProvince] = useState(DEFAULT_SERVICE_PROVINCE);
  const [notes, setNotes] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [isProvincePickerVisible, setIsProvincePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadProfile() {
        if (!user) {
          return;
        }

        setIsLoading(true);
        setMessage("");
        setName(user.name);

        try {
          if (user.role === "customer") {
            const profile = await getCustomerProfile();

            if (isActive && profile) {
              setCustomerProfile(profile);
              setPhoneNumber(profile.phone_number);
              setAddress(profile.address);
              setServiceProvince(profile.service_province || DEFAULT_SERVICE_PROVINCE);
              setNotes(profile.notes ?? "");
            }
          }

          if (user.role === "provider") {
            const profile = await getProviderProfile();

            if (isActive && profile) {
              setProviderProfile(profile);
              setPhoneNumber(profile.phone_number || "");
              setAddress(profile.address || "");
              setServiceProvince(profile.service_province || DEFAULT_SERVICE_PROVINCE);
              setNotes(profile.notes ?? "");
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

    if (!trimmedName || (user.role !== "admin" && (!trimmedPhone || !trimmedAddress))) {
      setMessage("Fill in the required fields.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateUserProfile({ name: trimmedName });

      if (user.role === "customer") {
        await updateCustomerProfile({
          phone_number: trimmedPhone,
          address: trimmedAddress,
          service_province: serviceProvince,
          latitude: customerProfile?.latitude ?? null,
          longitude: customerProfile?.longitude ?? null,
          current_address: customerProfile?.current_address ?? null,
          current_latitude: customerProfile?.current_latitude ?? null,
          current_longitude: customerProfile?.current_longitude ?? null,
          default_service_address: customerProfile?.default_service_address ?? null,
          default_service_latitude:
            customerProfile?.default_service_latitude ?? null,
          default_service_longitude:
            customerProfile?.default_service_longitude ?? null,
          notes: notes.trim() || null,
        });
      }

      if (user.role === "provider") {
        await updateProviderContactProfile({
          phone_number: trimmedPhone,
          address: trimmedAddress,
          service_province: serviceProvince,
          notes: notes.trim() || null,
        });
      }

      setMessage("Profile saved");
      navigation.goBack();
    } catch {
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

            {message ? <Text style={styles.messageText}>{message}</Text> : null}

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
    color: colors.danger,
    fontSize: 13,
  },
});
