import { ChevronDown, MapPin, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  POPULAR_TURKEY_PROVINCES,
  TURKEY_PROVINCES,
} from "../constants/turkeyProvinces";
import { colors, radius, spacing } from "../theme/theme";

type ProvincePickerModalProps = {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (province: string) => void;
};

export function ProvincePickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: ProvincePickerModalProps) {
  const [keyword, setKeyword] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const letters = useMemo(
    () => Array.from(new Set(TURKEY_PROVINCES.map((province) => province[0]))),
    [],
  );

  const sections = useMemo(() => {
    const cleanKeyword = keyword.trim().toLowerCase();
    const filteredProvinces = TURKEY_PROVINCES.filter((province) => {
      const matchesKeyword =
        !cleanKeyword || province.toLowerCase().includes(cleanKeyword);
      const matchesLetter = !activeLetter || province.startsWith(activeLetter);

      return matchesKeyword && matchesLetter;
    });

    return letters
      .map((letter) => ({
        title: letter,
        data: filteredProvinces.filter((province) => province.startsWith(letter)),
      }))
      .filter((section) => section.data.length > 0);
  }, [activeLetter, keyword, letters]);

  function handleSelect(province: string) {
    onSelect(province);
    setKeyword("");
    setActiveLetter(null);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MapPin color={colors.primary} size={22} />
              <Text style={styles.title}>Select service province</Text>
            </View>

            <Pressable
              accessibilityLabel="Close province picker"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X color={colors.text} size={20} />
            </Pressable>
          </View>

          <View style={styles.currentBox}>
            <Text style={styles.currentLabel}>Current province</Text>
            <View style={styles.currentValueRow}>
              <Text style={styles.currentValue}>{value}</Text>
              <ChevronDown color={colors.mutedText} size={16} />
            </View>
          </View>

          <View style={styles.searchBox}>
            <Search color={colors.mutedText} size={19} />
            <TextInput
              onChangeText={setKeyword}
              placeholder="Search provinces"
              placeholderTextColor={colors.mutedText}
              returnKeyType="search"
              style={styles.searchInput}
              value={keyword}
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Popular</Text>
            <View style={styles.popularGrid}>
              {POPULAR_TURKEY_PROVINCES.map((province) => {
                const isActive = province === value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={province}
                    onPress={() => handleSelect(province)}
                    style={[
                      styles.provinceChip,
                      isActive ? styles.provinceChipActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.provinceChipText,
                        isActive ? styles.provinceChipTextActive : null,
                      ]}
                    >
                      {province}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.letterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveLetter(null)}
              style={[
                styles.letterButton,
                activeLetter === null ? styles.letterButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.letterText,
                  activeLetter === null ? styles.letterTextActive : null,
                ]}
              >
                All
              </Text>
            </Pressable>

            {letters.map((letter) => (
              <Pressable
                accessibilityRole="button"
                key={letter}
                onPress={() => setActiveLetter(letter)}
                style={[
                  styles.letterButton,
                  activeLetter === letter ? styles.letterButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.letterText,
                    activeLetter === letter ? styles.letterTextActive : null,
                  ]}
                >
                  {letter}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <SectionList
            contentContainerStyle={styles.listContent}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isActive = item === value;

              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSelect(item)}
                  style={styles.listItem}
                >
                  <Text style={[styles.listItemText, isActive ? styles.activeText : null]}>
                    {item}
                  </Text>
                </Pressable>
              );
            }}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            sections={sections}
            stickySectionHeadersEnabled={false}
            style={styles.list}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    minHeight: 36,
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
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  currentBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  currentLabel: {
    color: colors.mutedText,
    fontSize: 13,
  },
  currentValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  currentValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  searchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  block: {
    gap: spacing.sm,
  },
  blockTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  popularGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  provinceChip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  provinceChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#E9F7F3",
  },
  provinceChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  provinceChipTextActive: {
    color: colors.primary,
  },
  letterRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  letterButton: {
    minWidth: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  letterButtonActive: {
    backgroundColor: colors.primary,
  },
  letterText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  letterTextActive: {
    color: "#FFFFFF",
  },
  list: {
    minHeight: 220,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  sectionHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  listItem: {
    minHeight: 42,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  activeText: {
    color: colors.primary,
    fontWeight: "700",
  },
});
