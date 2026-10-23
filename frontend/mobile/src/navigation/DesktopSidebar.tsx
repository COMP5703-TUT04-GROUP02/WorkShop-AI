import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandMark } from "../components/BrandMark";
import { PersonAvatar } from "../components/PersonAvatar";
import { formatMoney } from "../utils/money";
import { colors, layout, radius, spacing } from "../theme/theme";
import { AdminMenu } from "./AdminMenu";
import { useCurrentJob, useDesktopNav } from "./desktopNav";

export function DesktopSidebar() {
  const { active, isActive, items, navigation, open, user } = useDesktopNav();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <BrandMark size={26} />
        <Text style={styles.brandName}>
          Workshop <Text style={styles.brandSuffix}>AI</Text>
        </Text>
      </View>
      <View style={styles.rule} />
      <View style={styles.identity}>
        <PersonAvatar
          avatarUrl={user?.avatar_url}
          name={user?.name ?? user?.email}
          size={34}
        />
        <View style={styles.identityCopy}>
          <Text numberOfLines={1} style={styles.identityName}>
            {user?.name ?? user?.email ?? ""}
          </Text>
          <Text numberOfLines={1} style={styles.identityRole}>
            {user?.role === "provider"
              ? "Provider"
              : user?.role === "admin"
                ? "Platform"
                : "Customer"}
          </Text>
        </View>
      </View>
      <View style={styles.rule} />
      <SidebarNavigation isAdmin={user?.role === "admin"}>
        {user?.role === "admin" ? <AdminMenu active={active.tab === "AdminDashboard" ? active.area ?? "ai" : undefined} onSelect={(area) => navigation.navigate("Main", { screen: "AdminDashboard", params: { area } })} /> : null}
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.route ?? item.tab}
            onPress={() => open(item)}
            style={[styles.item, isActive(item) ? styles.itemActive : null]}
          >
            <item.icon
              color={isActive(item) ? colors.primary : colors.mutedText}
              size={20}
            />
            <Text
              style={[
                styles.itemLabel,
                isActive(item) ? styles.itemLabelActive : null,
              ]}
            >
              {item.label}
            </Text>
            {item.badge ? (
              <Text style={styles.badgeText}>
                {item.badge > 99 ? "99+" : item.badge}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </SidebarNavigation>
      {user?.role === "customer" ? (
        <CurrentJobCard
          onPress={() => navigation.navigate("Main", { screen: "CustomerBookings" })}
        />
      ) : null}
    </View>
  );
}

/** A read-only pin for whatever booking is waiting on the customer. */
function CurrentJobCard({ onPress }: { onPress: () => void }) {
  const job = useCurrentJob();

  if (!job) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.currentJob}
    >
      <Text style={styles.currentJobEyebrow}>Current job</Text>
      <Text numberOfLines={1} style={styles.currentJobTitle}>
        {job.title}
      </Text>
      <Text numberOfLines={1} style={styles.currentJobStatus}>
        <Text style={job.needsCustomer ? styles.currentJobDue : undefined}>
          {job.statusLabel}
        </Text>
        {job.amountDue != null ? (
          <Text style={styles.currentJobDue}> · {formatMoney(job.amountDue)}</Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

function SidebarNavigation({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  // Keep the original container for customer/provider navigation.
  return isAdmin
    ? <ScrollView contentContainerStyle={styles.nav}>{children}</ScrollView>
    : <View style={styles.nav}>{children}</View>;
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.webSidebarWidth,
    flexDirection: "column",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  brandName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  brandSuffix: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginHorizontal: spacing.sm,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  avatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  avatarLetter: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  identityRole: {
    color: colors.mutedText,
    fontSize: 12,
  },
  nav: {
    gap: spacing.xs,
  },
  item: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
  },
  itemActive: {
    backgroundColor: colors.primaryTint,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm - 3,
  },
  itemLabel: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: "600",
  },
  itemLabelActive: {
    color: colors.primary,
  },
  currentJob: {
    marginTop: "auto",
    marginBottom: spacing.md,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
  },
  currentJobEyebrow: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  currentJobTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  currentJobStatus: {
    color: colors.mutedText,
    fontSize: 12,
  },
  currentJobDue: {
    color: colors.warningText,
    fontWeight: "700",
  },
  badgeText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
