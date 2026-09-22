import { Check, MapPin, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  createLatestRequestGate,
  EMPTY_LOCATION_CASCADE,
  filterServiceLocations,
  getCompletedLocation,
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
};

export function LocationCascadePickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: LocationCascadePickerModalProps) {
  const [cascade, setCascade] = useState<LocationCascadeState>(
    EMPTY_LOCATION_CASCADE,
  );
  const [provinces, setProvinces] = useState<ServiceLocation[]>([]);
  const [cities, setCities] = useState<ServiceLocation[]>([]);
  const [districts, setDistricts] = useState<ServiceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [provinceKeyword, setProvinceKeyword] = useState("");
  const [cityKeyword, setCityKeyword] = useState("");
  const [districtKeyword, setDistrictKeyword] = useState("");
  const cityRequests = useRef(createLatestRequestGate()).current;
  const districtRequests = useRef(createLatestRequestGate()).current;
  const completedLocation = useMemo(
    () => getCompletedLocation(cascade),
    [cascade],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isActive = true;

    async function initialise() {
      cityRequests.invalidate();
      districtRequests.invalidate();
      setIsLoading(true);
      setMessage("");
      setProvinceKeyword("");
      setCityKeyword("");
      setDistrictKeyword("");

      try {
        const nextProvinces = await getServiceLocations();
        if (!isActive) {
          return;
        }
        setProvinces(nextProvinces);

        if (!value?.serviceLocationId) {
          setCascade(EMPTY_LOCATION_CASCADE);
          setCities([]);
          setDistricts([]);
          return;
        }

        const path = await getServiceLocationPath(value.serviceLocationId);
        const [nextCities, nextDistricts] = await Promise.all([
          getServiceLocations(path.province.id),
          getServiceLocations(path.city.id),
        ]);
        if (!isActive) {
          return;
        }
        setCascade(path);
        setCities(nextCities);
        setDistricts(nextDistricts);
      } catch {
        if (isActive) {
          setMessage("Couldn't load service areas. Try again.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void initialise();

    return () => {
      isActive = false;
      cityRequests.invalidate();
      districtRequests.invalidate();
    };
  }, [cityRequests, districtRequests, value?.serviceLocationId, visible]);

  async function handleProvince(province: ServiceLocation) {
    const requestId = cityRequests.begin();
    districtRequests.invalidate();
    setCascade((current) => chooseProvince(current, province));
    setCities([]);
    setDistricts([]);
    setCityKeyword("");
    setDistrictKeyword("");
    setMessage("");

    try {
      const nextCities = await getServiceLocations(province.id);
      if (cityRequests.isLatest(requestId)) {
        setCities(nextCities);
      }
    } catch {
      if (cityRequests.isLatest(requestId)) {
        setMessage("Couldn't load cities. Try again.");
      }
    }
  }

  async function handleCity(city: ServiceLocation) {
    const requestId = districtRequests.begin();
    setCascade((current) => chooseCity(current, city));
    setDistricts([]);
    setDistrictKeyword("");
    setMessage("");

    try {
      const nextDistricts = await getServiceLocations(city.id);
      if (districtRequests.isLatest(requestId)) {
        setDistricts(nextDistricts);
      }
    } catch {
      if (districtRequests.isLatest(requestId)) {
        setMessage("Couldn't load districts. Try again.");
      }
    }
  }

  function handleDistrict(district: ServiceLocation) {
    setCascade((current) => chooseDistrict(current, district));
    setMessage("");
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
                label="Province"
                locations={provinces}
                keyword={provinceKeyword}
                onKeywordChange={setProvinceKeyword}
                onSelect={(location) => void handleProvince(location)}
                selectedId={cascade.province?.id ?? null}
              />
              <LocationLevel
                emptyText="Select a province first"
                label="City"
                locations={cities}
                keyword={cityKeyword}
                onKeywordChange={setCityKeyword}
                onSelect={(location) => void handleCity(location)}
                selectedId={cascade.city?.id ?? null}
              />
              <LocationLevel
                emptyText="Select a city first"
                label="District"
                locations={districts}
                keyword={districtKeyword}
                onKeywordChange={setDistrictKeyword}
                onSelect={handleDistrict}
                selectedId={cascade.district?.id ?? null}
              />
            </ScrollView>
          )}

          {message ? <Text style={styles.errorText}>{message}</Text> : null}

          <Pressable
            accessibilityState={{ disabled: !completedLocation }}
            accessibilityRole="button"
            disabled={!completedLocation}
            onPress={() => completedLocation && onSelect(completedLocation)}
            style={[
              styles.confirmButton,
              !completedLocation ? styles.confirmButtonDisabled : null,
            ]}
          >
            <Text style={styles.confirmButtonText}>
              {completedLocation ? `Use ${completedLocation.label}` : "Choose a district"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LocationLevel({
  label,
  locations,
  keyword,
  onKeywordChange,
  selectedId,
  onSelect,
  emptyText = "No options available",
}: {
  label: string;
  locations: ServiceLocation[];
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  selectedId: number | null;
  onSelect: (location: ServiceLocation) => void;
  emptyText?: string;
}) {
  const filteredLocations = filterServiceLocations(locations, keyword);

  return (
    <View style={styles.level}>
      <Text style={styles.levelLabel}>{label}</Text>
      {locations.length > 0 ? (
        <>
          <View style={styles.searchBox}>
            <Search color={colors.mutedText} size={17} />
            <TextInput
              accessibilityLabel={`Search ${label.toLowerCase()}`}
              autoCapitalize="none"
              onChangeText={onKeywordChange}
              placeholder={`Search ${label.toLowerCase()}`}
              placeholderTextColor={colors.mutedText}
              style={styles.searchInput}
              value={keyword}
            />
          </View>
          {filteredLocations.length > 0 ? (
            <View style={styles.optionGrid}>
              {filteredLocations.map((location) => {
                const isSelected = location.id === selectedId;

                return (
                  <Pressable
                    accessibilityState={{ selected: isSelected }}
                    accessibilityRole="button"
                    key={location.id}
                    onPress={() => onSelect(location)}
                    style={[
                      styles.option,
                      isSelected ? styles.optionSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected ? styles.optionTextSelected : null,
                      ]}
                    >
                      {location.name}
                    </Text>
                    {isSelected ? (
                      <Check color={colors.primary} size={16} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No matching {label.toLowerCase()}
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.emptyText}>{emptyText}</Text>
      )}
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
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 13,
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
  searchBox: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  option: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: "#E9F7F3",
  },
  optionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  optionTextSelected: {
    color: colors.primary,
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
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
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
