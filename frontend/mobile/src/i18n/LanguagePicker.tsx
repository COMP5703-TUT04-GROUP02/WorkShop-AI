import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import { useLanguage } from "./LanguageContext";
import type { AppLanguage } from "./language";

const OPTIONS: { value: AppLanguage; nativeLabel: string }[] = [
  { value: "en", nativeLabel: "English" },
  { value: "tr", nativeLabel: "Türkçe" },
];

export function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t("Language")}</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityLabel={option.nativeLabel}
            accessibilityRole="radio"
            accessibilityState={{ checked: language === option.value }}
            onPress={() => { void setLanguage(option.value); }}
            style={[styles.option, language === option.value && styles.selected]}
          >
            <Text style={[styles.optionText, language === option.value && styles.selectedText]}>
              {option.nativeLabel}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, padding: spacing.md },
  heading: { color: colors.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", gap: spacing.sm },
  option: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.text, fontWeight: "600" },
  selectedText: { color: "#FFFFFF" },
});
