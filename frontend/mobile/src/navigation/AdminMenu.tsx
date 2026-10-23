import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../theme/theme";
import { tabIcons } from "./tabIcons";

export const ADMIN_PAGES = [
  ["ai", "Customer AI"],
  ["embedding", "Review embeddings"],
  ["verification", "Provider verification"],
  ["portfolio", "Portfolios pending review"],
  ["reviews", "Review visibility management"],
  ["payouts", "Provider payout accounts"],
  ["payments", "Payments & settlements"],
  ["bookings", "Booking lookup"],
  ["refunds", "Refund appeals pending review"],
] as const;
export type AdminArea = typeof ADMIN_PAGES[number][0];

function MenuChevron({ expanded, active }: { expanded: boolean; active: boolean }) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <View style={styles.chevron}>
      <Icon color={active ? colors.primary : colors.mutedText} size={18} />
    </View>
  );
}

export function AdminMenu({ active, onSelect }: {
  active?: AdminArea;
  onSelect: (area: AdminArea) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [providerExpanded, setProviderExpanded] = useState(true);
  const providerActive = active === "verification" || active === "portfolio";
  const AdminIcon = tabIcons.admin;

  const leaf = ([id, label]: typeof ADMIN_PAGES[number]) => (
    <Pressable
      key={id}
      accessibilityRole="button"
      accessibilityState={{ selected: active === id }}
      onPress={() => onSelect(id)}
      style={[styles.item, active === id && styles.selected]}
    >
      <Text style={[styles.text, active === id && styles.active]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.menu}>
      <Pressable
        accessibilityLabel="Admin"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={styles.item}
      >
        <AdminIcon color={active ? colors.primary : colors.mutedText} size={20} />
        <Text style={[styles.text, !!active && styles.active]}>Admin</Text>
        <MenuChevron expanded={expanded} active={!!active} />
      </Pressable>
      {expanded ? (
        <View style={[styles.children, styles.adminChildren]}>
          {ADMIN_PAGES.slice(0, 2).map(leaf)}
          <Pressable
            accessibilityLabel="Provider information review"
            accessibilityRole="button"
            accessibilityState={{ expanded: providerExpanded }}
            aria-expanded={providerExpanded}
            onPress={() => setProviderExpanded(!providerExpanded)}
            style={styles.item}
          >
            <Text style={[styles.text, providerActive && styles.active]}>
              Provider information review
            </Text>
            <MenuChevron expanded={providerExpanded} active={providerActive} />
          </Pressable>
          {providerExpanded ? (
            <View style={styles.children}>{ADMIN_PAGES.slice(2, 4).map(leaf)}</View>
          ) : null}
          {ADMIN_PAGES.slice(4).map(leaf)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { gap: spacing.xs },
  children: {
    marginLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: spacing.xs,
    gap: spacing.xs,
  },
  adminChildren: { marginLeft: spacing.lg },
  item: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: 10,
  },
  text: { flex: 1, minWidth: 0, color: colors.mutedText, fontSize: 15, fontWeight: "600" },
  chevron: { width: 18, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.primaryTint },
  active: { color: colors.primary },
});
