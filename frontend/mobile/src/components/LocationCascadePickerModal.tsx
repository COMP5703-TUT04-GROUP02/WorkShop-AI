import { Check, ChevronDown, MapPin, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getServiceLocationPath,
  getServiceLocations,
} from "../api/locations";
import {
  chooseCity,
  chooseDistrict,
  chooseProvince,
  CUSTOMER_DEFAULT_LOCATION_CODES,
  EMPTY_LOCATION_CASCADE,
  findLocationByCode,
  findLocationByName,
  getCompletedLocation,
  sortServiceLocations,
  type LocationCascadeState,
} from "../features/locations/location-cascade-state";
import { colors, radius, spacing } from "../theme/theme";
import type {
  ServiceAreaSelection,
  ServiceLocation,
} from "../types/location";

type LocationCascadePickerModalProps = {
  visible: boolean;
  value: ServiceAreaSelection | null;
  onClose: () => void;
  onSelect: (selection: ServiceAreaSelection) => void;
  allowAnyLevel?: boolean;
  fallbackProvinceName?: string;
};

export function LocationCascadePickerModal({
  visible,
  value,
  onClose,
  onSelect,
  allowAnyLevel = false,
  fallbackProvinceName,
}: LocationCascadePickerModalProps) {
  const [cascade, setCascade] = useState<LocationCascadeState>(
    EMPTY_LOCATION_CASCADE,
  );
  const [provinces, setProvinces] = useState<ServiceLocation[]>([]);
  const [cities, setCities] = useState<ServiceLocation[]>([]);
  const [districts, setDistricts] = useState<ServiceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedLevel, setExpandedLevel] = useState<ServiceLocation["level"] | null>(null);
  const requestVersion = useRef(0);
  const completedLocation = useMemo(
    () => getCompletedLocation(cascade, allowAnyLevel),
    [allowAnyLevel, cascade],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isActive = true;
    const version = ++requestVersion.current;
    setExpandedLevel(null);

    async function initialise() {
      setIsLoading(true);
      setMessage("");

      try {
        const nextProvinces = await getServiceLocations();
        if (!isActive || version !== requestVersion.current) {
          return;
        }
        if (nextProvinces.length === 0) {
          throw new Error("No service areas were returned.");
        }
        setProvinces(sortServiceLocations(
          nextProvinces,
          allowAnyLevel ? undefined : CUSTOMER_DEFAULT_LOCATION_CODES.province,
        ));

        if (!value?.serviceLocationId) {
          if (allowAnyLevel) {
            setCascade(EMPTY_LOCATION_CASCADE);
            setCities([]);
            setDistricts([]);
            return;
          }

          const province = (
            fallbackProvinceName
              ? findLocationByName(nextProvinces, fallbackProvinceName)
              : null
          ) ?? findLocationByCode(nextProvinces, CUSTOMER_DEFAULT_LOCATION_CODES.province);
          if (!province) {
            setCascade(EMPTY_LOCATION_CASCADE);
            setCities([]);
            setDistricts([]);
            return;
          }
          const nextCities = await getServiceLocations(province.id);
          const city = findLocationByCode(nextCities, CUSTOMER_DEFAULT_LOCATION_CODES.city)
            ?? (nextCities.length === 1 ? nextCities[0] : null);
          const nextDistricts = city ? await getServiceLocations(city.id) : [];
          const district = findLocationByCode(nextDistricts, CUSTOMER_DEFAULT_LOCATION_CODES.district)
            ?? (nextDistricts.length === 1 ? nextDistricts[0] : null);
          if (!isActive || version !== requestVersion.current) return;
          setCascade({ province, city, district });
          setCities(sortServiceLocations(nextCities, CUSTOMER_DEFAULT_LOCATION_CODES.city));
          setDistricts(sortServiceLocations(nextDistricts, CUSTOMER_DEFAULT_LOCATION_CODES.district));
          return;
        }

        const path = await getServiceLocationPath(value.serviceLocationId);
        const nextCities = await getServiceLocations(path.province.id);
        const nextDistricts = path.city
          ? await getServiceLocations(path.city.id)
          : [];
        if (!isActive || version !== requestVersion.current) {
          return;
        }
        setCascade(path);
        setCities(sortServiceLocations(nextCities, allowAnyLevel ? undefined : CUSTOMER_DEFAULT_LOCATION_CODES.city));
        setDistricts(sortServiceLocations(nextDistricts, allowAnyLevel ? undefined : CUSTOMER_DEFAULT_LOCATION_CODES.district));
      } catch {
        if (isActive && version === requestVersion.current) {
          setMessage("Couldn't load service areas. Try again.");
        }
      } finally {
        if (isActive && version === requestVersion.current) {
          setIsLoading(false);
        }
      }
    }

    void initialise();

    return () => {
      isActive = false;
      requestVersion.current += 1;
    };
  }, [allowAnyLevel, fallbackProvinceName, reloadKey, value?.serviceLocationId, visible]);

  async function handleProvince(province: ServiceLocation) {
    const version = ++requestVersion.current;
    setCascade((current) => chooseProvince(current, province));
    setCities([]);
    setDistricts([]);
    setMessage("");
    setExpandedLevel(null);

    try {
      const nextCities = sortServiceLocations(
        await getServiceLocations(province.id),
        allowAnyLevel ? undefined : CUSTOMER_DEFAULT_LOCATION_CODES.city,
      );
      if (version !== requestVersion.current) return;
      setCities(nextCities);
      if (!allowAnyLevel && nextCities.length === 1) {
        const city = nextCities[0];
        setCascade({ province, city, district: null });
        const nextDistricts = sortServiceLocations(
          await getServiceLocations(city.id),
          CUSTOMER_DEFAULT_LOCATION_CODES.district,
        );
        if (version !== requestVersion.current) return;
        setDistricts(nextDistricts);
        if (nextDistricts.length === 1) {
          setCascade({ province, city, district: nextDistricts[0] });
        }
      }
    } catch {
      if (version === requestVersion.current) setMessage("Couldn't load service areas. Try again.");
    }
  }

  async function handleCity(city: ServiceLocation) {
    const version = ++requestVersion.current;
    setCascade((current) => chooseCity(current, city));
    setDistricts([]);
    setMessage("");
    setExpandedLevel(null);

    try {
      const nextDistricts = sortServiceLocations(
        await getServiceLocations(city.id),
        allowAnyLevel ? undefined : CUSTOMER_DEFAULT_LOCATION_CODES.district,
      );
      if (version !== requestVersion.current) return;
      setDistricts(nextDistricts);
      if (!allowAnyLevel && nextDistricts.length === 1) {
        setCascade((current) => chooseDistrict(current, nextDistricts[0]));
      }
    } catch {
      if (version === requestVersion.current) setMessage("Couldn't load districts. Try again.");
    }
  }

  function handleDistrict(district: ServiceLocation) {
    setCascade((current) => chooseDistrict(current, district));
    setMessage("");
    setExpandedLevel(null);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MapPin color={colors.primary} size={22} />
              <View>
                <Text style={styles.title}>Select service area</Text>
                <Text style={styles.subtitle}>Province / City / District</Text>
              </View>
            </View>
            <Pressable
          hitSlop={4}
              accessibilityLabel="Close service area picker"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X color={colors.text} size={20} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading service areas...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <LocationLevel
                expanded={expandedLevel === "province"}
                label="Province"
                level="province"
                locations={provinces}
                onSelect={(location) => void handleProvince(location)}
                onToggle={() => setExpandedLevel((current) => current === "province" ? null : "province")}
                selectedId={cascade.province?.id ?? null}
              />
              <LocationLevel
                disabled={!cascade.province}
                expanded={expandedLevel === "city"}
                label="City"
                level="city"
                locations={cities}
                onSelect={(location) => void handleCity(location)}
                onToggle={() => setExpandedLevel((current) => current === "city" ? null : "city")}
                selectedId={cascade.city?.id ?? null}
              />
              <LocationLevel
                disabled={!cascade.city}
                expanded={expandedLevel === "district"}
                label="District"
                level="district"
                locations={districts}
                onSelect={handleDistrict}
                onToggle={() => setExpandedLevel((current) => current === "district" ? null : "district")}
                selectedId={cascade.district?.id ?? null}
              />
            </ScrollView>
          )}

          {message ? (
            <View style={styles.retryRow}>
              <Text style={styles.errorText}>{message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReloadKey((current) => current + 1)}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!completedLocation}
            onPress={() => completedLocation && onSelect(completedLocation)}
            style={[
              styles.confirmButton,
              !completedLocation ? styles.confirmButtonDisabled : null,
            ]}
          >
            <Text style={styles.confirmButtonText}>
              {completedLocation
                ? `Use ${completedLocation.label}`
                : allowAnyLevel
                  ? "Choose a province, city, or district"
                  : "Choose a district"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LocationLevel({
  disabled = false,
  expanded,
  label,
  level,
  locations,
  selectedId,
  onSelect,
  onToggle,
}: {
  disabled?: boolean;
  expanded: boolean;
  label: string;
  level: ServiceLocation["level"];
  locations: ServiceLocation[];
  selectedId: number | null;
  onSelect: (location: ServiceLocation) => void;
  onToggle: () => void;
}) {
  const selected = locations.find((location) => location.id === selectedId);
  const placeholder = disabled
    ? level === "city" ? "Select a province first" : "Select a city first"
    : locations.length === 0 ? "No options available" : `Select ${label.toLowerCase()}`;

  return (
    <View style={styles.level}>
      <Text style={styles.levelLabel}>{label}</Text>
      <Pressable
        accessibilityLabel={`${label}: ${selected?.name ?? placeholder}`}
        accessibilityRole="button"
        disabled={disabled || locations.length === 0}
        onPress={onToggle}
        style={[styles.dropdown, disabled ? styles.dropdownDisabled : null]}
      >
        <Text style={selected ? styles.selectedText : styles.placeholderText}>
          {selected?.name ?? placeholder}
        </Text>
        <ChevronDown color={colors.mutedText} size={18} />
      </Pressable>
      {expanded ? (
        <ScrollView nestedScrollEnabled style={styles.optionsList}>
          {locations.map((location) => {
            const isSelected = location.id === selectedId;
            return (
              <Pressable
                accessibilityRole="button"
                key={location.id}
                onPress={() => onSelect(location)}
                style={[styles.option, isSelected ? styles.optionSelected : null]}
              >
                <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : null]}>
                  {location.name}
                </Text>
                {isSelected ? <Check color={colors.primary} size={16} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  loadingBox: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  level: {
    gap: spacing.sm,
  },
  levelLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  dropdown: {
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
  dropdownDisabled: {
    opacity: 0.55,
  },
  selectedText: {
    color: colors.text,
    fontSize: 16,
  },
  placeholderText: {
    color: colors.mutedText,
    fontSize: 16,
  },
  optionsList: {
    maxHeight: 210,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  option: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.primaryTint,
  },
  optionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  optionTextSelected: {
    color: colors.primary,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 14,
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  confirmButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
