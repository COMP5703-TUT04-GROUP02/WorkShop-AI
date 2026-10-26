import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "../theme/theme";

/**
 * The blue bubble that carries an unread or outstanding count.
 *
 * It was written four times over - on the notification bell, on the account
 * pill, and as flat grey text beside two navigation labels - so a count meant
 * one thing in one place and something quieter in another. One bubble now, and
 * the caller decides where it sits.
 */
export function CountBadge({
  count,
  max = 99,
}: {
  count: number | undefined;
  /** Above this the bubble reads "99+" rather than growing. */
  max?: number;
}) {
  if (!count || count < 1) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{count > max ? `${max}+` : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 15,
  },
});
