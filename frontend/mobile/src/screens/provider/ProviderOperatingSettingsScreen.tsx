import { useFocusEffect } from "@react-navigation/native";
import { MapPin } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  getProviderProfile,
  patchProviderOperatingSettings,
} from "../../api/provider";
import { LocationCascadePickerModal } from "../../components/LocationCascadePickerModal";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type { ServiceAreaSelection } from "../../types/location";
import type {
  ProviderOperatingSettingsPayload,
  ProviderProfile,
} from "../../types/provider";
import { getErrorMessage } from "../../utils/errors";

/**
 * WS-107. Price, service area and radius on their own screen, reachable only
 * once an admin has approved the qualification — WS-106 enforces the same rule
 * server-side.
 *
 * Only changed fields are sent: the endpoint takes a partial update, and
 * saving here is not a profile edit, so it never puts the provider back in the
 * review queue.
 */
export function ProviderOperatingSettingsScreen() {
  const [hourlyRate, setHourlyRate] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [area, setArea] = useState<ServiceAreaSelection | null>(null);
  const [saved, setSaved] = useState<{
    hourlyRate: string;
    radiusKm: string;
    serviceLocationId: number | null;
  } | null>(null);
  const [isAreaPickerVisible, setIsAreaPickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const applyProfile = useCallback((profile: ProviderProfile) => {
    const nextRate = profile.hourly_rate ? String(profile.hourly_rate) : "";
    const nextRadius = profile.service_radius_km
      ? String(profile.service_radius_km)
      : "";

    setHourlyRate(nextRate);
    setRadiusKm(nextRadius);
    setArea(
      profile.service_location_id
        ? {
            serviceLocationId: profile.service_location_id,
            serviceProvince: profile.service_province,
            // The profile stores the province, not the full path; a fresh pick
            // replaces this with the cascade's own label.
            label: profile.service_province,
          }
        : null,
    );
    setSaved({
      hourlyRate: nextRate,
      radiusKm: nextRadius,
      serviceLocationId: profile.service_location_id,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function load() {
        setIsLoading(true);
        setErrorMessage("");

        try {
          const profile = await getProviderProfile();

          if (isActive && profile) {
            applyProfile(profile);
          }
        } catch (error) {
          if (isActive) {
            setErrorMessage(getErrorMessage(error));
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [applyProfile]),
  );

  async function handleSave() {
    setErrorMessage("");
    setSuccessMessage("");

    const rate = Number(hourlyRate);
    const distance = Number(radiusKm);

    if (!hourlyRate.trim() || !Number.isFinite(rate) || rate <= 0) {
      setErrorMessage("Enter an hourly rate above 0.");
      return;
    }

    if (!radiusKm.trim() || !Number.isFinite(distance) || distance <= 0) {
      setErrorMessage("Enter a service radius above 0.");
      return;
    }

    if (!area) {
      setErrorMessage("Pick the area you work in.");
      return;
    }

    // The endpoint takes a partial update and rejects nulls, so only what
    // actually changed goes in the payload.
    const payload: ProviderOperatingSettingsPayload = {};

    if (hourlyRate !== saved?.hourlyRate) {
      payload.hourly_rate = Math.round(rate);
    }
    if (radiusKm !== saved?.radiusKm) {
      payload.service_radius_km = distance;
    }
    if (area.serviceLocationId !== saved?.serviceLocationId) {
      payload.service_location_id = area.serviceLocationId;
    }

    if (Object.keys(payload).length === 0) {
      setSuccessMessage("Nothing to save.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await patchProviderOperatingSettings(payload);

      if (result?.profile) {
        applyProfile(result.profile);
      }

      setSuccessMessage("Operating settings saved.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Operating settings</Text>
      <Text style={styles.subtitle}>
        What you charge, where you work, and how far you travel. Saving these
        does not send your profile back for review.
      </Text>

      {isLoading ? (
        <ActivityIndicator accessibilityLabel="Loading settings" color={colors.primary} />
      ) : (
        <View style={styles.card}>
          <TextField
            keyboardType="number-pad"
            label="Hourly rate (TRY)"
            onChangeText={(value) => setHourlyRate(value.replace(/[^0-9]/g, ""))}
            placeholder="500"
            value={hourlyRate}
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Service area</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsAreaPickerVisible(true)}
              style={({ pressed }) => [
                styles.areaButton,
                pressed ? styles.areaButtonPressed : null,
              ]}
            >
              <MapPin color={colors.mutedText} size={18} />
              <Text
                numberOfLines={2}
                style={[styles.areaText, area ? null : styles.areaPlaceholder]}
              >
                {area?.label ?? "Pick a province, city and district"}
              </Text>
            </Pressable>
          </View>

          <TextField
            keyboardType="decimal-pad"
            label="Service radius (km)"
            onChangeText={(value) => setRadiusKm(value.replace(/[^0-9.]/g, ""))}
            placeholder="15"
            value={radiusKm}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? (
            <Text style={styles.success}>{successMessage}</Text>
          ) : null}

          <PrimaryButton
            isLoading={isSaving}
            label="Save"
            onPress={() => void handleSave()}
          />
        </View>
      )}

      <LocationCascadePickerModal
        onClose={() => setIsAreaPickerVisible(false)}
        onSelect={(selection) => {
          setArea(selection);
          setIsAreaPickerVisible(false);
          setErrorMessage("");
          setSuccessMessage("");
        }}
        value={area}
        visible={isAreaPickerVisible}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  areaButton: {
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
  areaButtonPressed: {
    backgroundColor: colors.surface,
  },
  areaText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  areaPlaceholder: {
    color: colors.mutedText,
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
});
