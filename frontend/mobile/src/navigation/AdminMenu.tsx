import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/theme";

export const ADMIN_PAGES = [
  ["ai", "Customer AI"], ["embedding", "Review embeddings"],
  ["verification", "Provider verification"], ["portfolio", "Portfolios pending review"],
  ["reviews", "Review visibility management"], ["payouts", "Provider payout accounts"],
  ["payments", "Payments & settlements"], ["refunds", "Refund appeals pending review"],
] as const;
export type AdminArea = typeof ADMIN_PAGES[number][0];

export function AdminMenu({ active, onSelect }: { active?: AdminArea; onSelect: (area: AdminArea) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [providerExpanded, setProviderExpanded] = useState(true);
  const leaf = ([id, label]: typeof ADMIN_PAGES[number]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: active === id }} onPress={() => onSelect(id)} style={[styles.item, active === id && styles.selected]}><Text style={[styles.text, active === id && styles.active]}>{label}</Text></Pressable>;
  return <View style={styles.menu}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.item}><Text style={[styles.text, active && styles.active]}>Admin {expanded ? "⌄" : "›"}</Text></Pressable>
    {expanded ? <View style={styles.children}>
      {ADMIN_PAGES.slice(0, 2).map(leaf)}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: providerExpanded }} onPress={() => setProviderExpanded(!providerExpanded)} style={styles.item}><Text style={[styles.text, (active === "verification" || active === "portfolio") && styles.active]}>Provider information review {providerExpanded ? "⌄" : "›"}</Text></Pressable>
      {providerExpanded ? <View style={styles.children}>{ADMIN_PAGES.slice(2, 4).map(leaf)}</View> : null}
      {ADMIN_PAGES.slice(4).map(leaf)}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  menu: { gap: spacing.xs }, children: { marginLeft: spacing.sm, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: spacing.xs, gap: 4 },
  item: { minHeight: 44, justifyContent: "center", padding: spacing.sm, borderRadius: 10 },
  selected: { backgroundColor: "#E9F7F3" }, text: { color: colors.mutedText, fontSize: 14, fontWeight: "600" }, active: { color: colors.primary },
});
