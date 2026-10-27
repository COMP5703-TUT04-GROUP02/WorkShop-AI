import { T } from "../i18n/T";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";

type PlaceholderPanelProps = {
  title: string;
  description: string;
};

export function PlaceholderPanel({ title, description }: PlaceholderPanelProps) {
  return (
    <View style={styles.panel}>
      <T style={styles.title}>{title}</T>
      <T style={styles.description}>{description}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  description: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
});
