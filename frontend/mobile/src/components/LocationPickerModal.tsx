import * as Location from "expo-location";
import { LocateFixed, MapPin, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GOOGLE_MAPS_API_KEY } from "../config/env";
import { colors, radius, spacing } from "../theme/theme";
import type { SelectedLocation } from "../types/location";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

type LocationPickerModalProps = {
  visible: boolean;
  value: SelectedLocation | null;
  onClose: () => void;
  onConfirm: (location: SelectedLocation) => void;
};

type GooglePlaceSuggestion = {
  placeId: string;
  description: string;
};

let googleMapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript() {
  if (Platform.OS !== "web" || !GOOGLE_MAPS_API_KEY) {
    return Promise.resolve();
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise;
  }

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-workshop-google-maps]",
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () =>
        reject(new Error("Google Maps failed to load")),
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.workshopGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=zh-CN`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

export function LocationPickerModal({
  visible,
  value,
  onClose,
  onConfirm,
}: LocationPickerModalProps) {
  const [label, setLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLabel(value?.label ?? "");
    setLatitude(
      value?.latitude === null || value?.latitude === undefined
        ? ""
        : String(value.latitude),
    );
    setLongitude(
      value?.longitude === null || value?.longitude === undefined
        ? ""
        : String(value.longitude),
    );
    setErrorMessage("");
    setSuggestions([]);
  }, [visible, value]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    loadGoogleMapsScript()
      .then(() => {
        if (Platform.OS !== "web" || !window.google?.maps?.places) {
          setIsGoogleReady(false);
          return;
        }

        autocompleteServiceRef.current =
          new window.google.maps.places.AutocompleteService();
        const mapDiv = document.createElement("div");
        placesServiceRef.current = new window.google.maps.places.PlacesService(
          mapDiv,
        );
        setIsGoogleReady(true);
      })
      .catch(() => {
        setIsGoogleReady(false);
      });
  }, [visible]);

  function handleLabelChange(nextLabel: string) {
    setLabel(nextLabel);

    if (!isGoogleReady || !autocompleteServiceRef.current || !nextLabel.trim()) {
      setSuggestions([]);
      return;
    }

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: nextLabel,
        types: ["geocode"],
      },
      (predictions: google.maps.places.AutocompletePrediction[] | null) => {
        setSuggestions(
          (predictions ?? []).slice(0, 5).map((prediction) => ({
            placeId: prediction.place_id,
            description: prediction.description,
          })),
        );
      },
    );
  }

  function selectGoogleSuggestion(suggestion: GooglePlaceSuggestion) {
    if (!placesServiceRef.current) {
      return;
    }

    placesServiceRef.current.getDetails(
      {
        placeId: suggestion.placeId,
        fields: ["formatted_address", "geometry", "name"],
      },
      (
        place: google.maps.places.PlaceResult | null,
        status: google.maps.places.PlacesServiceStatus | string,
      ) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          setErrorMessage("Couldn't read this address. Try another one.");
          return;
        }

        const lat = place?.geometry?.location?.lat();
        const lng = place?.geometry?.location?.lng();

        setLabel(place?.formatted_address || place?.name || suggestion.description);
        setLatitude(typeof lat === "number" ? lat.toFixed(6) : "");
        setLongitude(typeof lng === "number" ? lng.toFixed(6) : "");
        setSuggestions([]);
        setErrorMessage("");
      },
    );
  }

  async function useCurrentLocation() {
    setErrorMessage("");
    setIsLocating(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setErrorMessage("Location access denied. Enter it manually.");
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const nextLatitude = currentLocation.coords.latitude;
      const nextLongitude = currentLocation.coords.longitude;

      setLatitude(nextLatitude.toFixed(6));
      setLongitude(nextLongitude.toFixed(6));
      setLabel((currentLabel) => currentLabel || "Current location");
    } catch {
      setErrorMessage("Couldn't get your location. Enter it manually.");
    } finally {
      setIsLocating(false);
    }
  }

  function handleConfirm() {
    const parsedLatitude = latitude.trim() ? Number(latitude) : null;
    const parsedLongitude = longitude.trim() ? Number(longitude) : null;

    if (!label.trim()) {
      setErrorMessage("Enter a location name or address.");
      return;
    }

    if (
      parsedLatitude !== null &&
      (Number.isNaN(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90)
    ) {
      setErrorMessage("Latitude must be between -90 and 90.");
      return;
    }

    if (
      parsedLongitude !== null &&
      (Number.isNaN(parsedLongitude) ||
        parsedLongitude < -180 ||
        parsedLongitude > 180)
    ) {
      setErrorMessage("Longitude must be between -180 and 180.");
      return;
    }

    onConfirm({
      label: label.trim(),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
    });
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select service location</Text>
              <Text style={styles.subtitle}>Filter nearby available providers</Text>
            </View>
            <Pressable
              accessibilityLabel="Close location picker"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X color={colors.text} size={20} />
            </Pressable>
          </View>

          <View style={styles.mapPreview}>
            <MapPin color={colors.primary} size={34} />
            <Text style={styles.mapTitle}>
              {label.trim() || "No location selected"}
            </Text>
            <Text style={styles.mapText}>
              {latitude && longitude
                ? `${latitude}, ${longitude}`
                : "Use your location or enter an address"}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              onChangeText={handleLabelChange}
              placeholder="e.g. Building A"
              placeholderTextColor={colors.mutedText}
              style={styles.input}
              value={label}
            />

            {suggestions.length > 0 ? (
              <View style={styles.suggestionList}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion.placeId}
                    onPress={() => selectGoogleSuggestion(suggestion)}
                    style={styles.suggestionItem}
                  >
                    <MapPin color={colors.mutedText} size={16} />
                    <Text style={styles.suggestionText}>
                      {suggestion.description}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.coordinateRow}>
              <View style={styles.coordinateField}>
                <Text style={styles.label}>Latitude</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={setLatitude}
                  placeholder="-33.8688"
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                  value={latitude}
                />
              </View>
              <View style={styles.coordinateField}>
                <Text style={styles.label}>Longitude</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={setLongitude}
                  placeholder="151.2093"
                  placeholderTextColor={colors.mutedText}
                  style={styles.input}
                  value={longitude}
                />
              </View>
            </View>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            <SecondaryButton
              disabled={isLocating}
              label={isLocating ? "Locating..." : "Use current location"}
              onPress={useCurrentLocation}
            />
            <PrimaryButton label="Confirm location" onPress={handleConfirm} />
          </View>

          <View style={styles.tipRow}>
            <LocateFixed color={colors.mutedText} size={16} />
            <Text style={styles.tipText}>
              {isGoogleReady
                ? "Choose a suggestion to fill in coordinates."
                : "Enter the address and coordinates."}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
  },
  sheet: {
    maxHeight: "92%",
    gap: spacing.md,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.mutedText,
    fontSize: 14,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  mapPreview: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  mapTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  mapText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  suggestionList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  suggestionItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  coordinateRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  coordinateField: {
    flex: 1,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tipText: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});
