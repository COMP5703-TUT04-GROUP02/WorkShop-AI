import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, type } from "../theme/theme";

type PlaceholderPanelProps = {
  title: string;
  description: string;
  /** What the reader can do about it, where there is something. */
  actions?: ReactNode;
};

/**
 * What a screen says when it has nothing to list. There were two of these: this
 * one, which had no room for actions, and a card hand-rolled in the four
 * screens that needed them - with the title at 18 in three of them and 16 here.
 * One panel, one set of sizes, and an actions slot so nobody writes the card
 * again.
 *
 * Left aligned, like every other card in the product. Centred text is the other
 * convention and not a better one; what made these read as unfinished was the
 * ground they sat on and the room they were given, not the alignment.
 */
export function PlaceholderPanel({
  title,
  description,
  actions,
}: PlaceholderPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    // White, not the page ground: on grey this was a card you could not see.
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: type.section,
    fontWeight: "700",
  },
  description: {
    maxWidth: 560,
    color: colors.mutedText,
    fontSize: type.body,
    lineHeight: 24,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
