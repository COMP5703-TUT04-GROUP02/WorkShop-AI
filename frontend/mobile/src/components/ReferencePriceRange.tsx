import { StyleSheet, Text, View } from "react-native";

import { useLanguage } from "../i18n/LanguageContext";
import { translateText } from "../i18n/translations";
import { colors, radius, spacing } from "../theme/theme";
import type { ReferencePriceRange as ReferencePriceRangeValue } from "../types/booking";
import { buildReferencePricePresentation } from "../utils/referencePrice";

type ReferencePriceRangeProps = {
  audience: "provider" | "customer";
  range?: ReferencePriceRangeValue | null;
};

export function ReferencePriceRange({
  audience,
  range,
}: ReferencePriceRangeProps) {
  const { language } = useLanguage();
  const presentation = buildReferencePricePresentation(range, audience);
  if (audience === "provider" && presentation.value == null) {
    return null;
  }

  return (
    <View style={[styles.card, audience === "customer" ? styles.customerCard : null]}>
      <Text style={styles.label}>{translateText(language, presentation.label)}</Text>
      {presentation.value ? (
        <Text style={styles.value}>{translateText(language, presentation.value)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  customerCard: {
    backgroundColor: "transparent",
    padding: 0,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
