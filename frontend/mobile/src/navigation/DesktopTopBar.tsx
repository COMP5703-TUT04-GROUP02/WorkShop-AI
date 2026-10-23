import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandMark } from "../components/BrandMark";
import { NotificationsButton } from "../components/NotificationsButton";
import { PersonAvatar } from "../components/PersonAvatar";
import { colors, layout, radius, spacing } from "../theme/theme";
import { formatMoney } from "../utils/money";
import { useCurrentJob, useDesktopNav, type DesktopNavItem } from "./desktopNav";

/**
 * The desktop shell for customers and providers: five destinations fit across
 * the top, which gives the listing grids below the full width of the window.
 * Admin keeps the sidebar, where its nested sections have room to open.
 */
export function DesktopTopBar() {
  const { isActive, items, navigation, notificationUnreadCount, open, user } =
    useDesktopNav();
  const account = items.find((item) => item.tab === "Account");
  const destinations = items.filter((item) => item.tab !== "Account");

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <Pressable
          accessibilityLabel="Workshop AI home"
          accessibilityRole="button"
          onPress={() => destinations[0] && open(destinations[0])}
          style={styles.brand}
        >
          <BrandMark size={26} />
          <Text style={styles.brandName}>
            Workshop <Text style={styles.brandSuffix}>AI</Text>
          </Text>
        </Pressable>

        <View style={styles.nav}>
          {destinations.map((item) => (
            <NavItem
              item={item}
              isActive={Boolean(isActive(item))}
              key={item.route ?? item.tab}
              onPress={() => open(item)}
            />
          ))}
        </View>

        <View style={styles.rightRule} />

        <View style={styles.right}>
          {user?.role === "customer" ? (
            <CurrentJobPill
              onPress={() =>
                navigation.navigate("Main", { screen: "CustomerBookings" })
              }
            />
          ) : null}

          <NotificationsButton unreadCount={notificationUnreadCount} />

          {account ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(account)}
              style={[
                styles.account,
                isActive(account) ? styles.accountActive : null,
              ]}
            >
              <PersonAvatar
                avatarUrl={user?.avatar_url}
                name={user?.name ?? user?.email}
                size={32}
              />
              <View style={styles.accountCopy}>
                <Text numberOfLines={1} style={styles.accountName}>
                  {user?.name ?? user?.email ?? ""}
                </Text>
                <Text numberOfLines={1} style={styles.accountRole}>
                  {user?.role === "provider" ? "Provider" : "Customer"}
                </Text>
              </View>
              {account.badge ? (
                <View style={styles.accountBadge}>
                  <Text style={styles.accountBadgeText}>
                    {account.badge > 99 ? "99+" : account.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function NavItem({
  isActive,
  item,
  onPress,
}: {
  isActive: boolean;
  item: DesktopNavItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        pressed ? styles.itemPressed : null,
      ]}
    >
      <item.icon
        color={isActive ? colors.primary : colors.mutedText}
        size={19}
      />
      <Text style={[styles.itemLabel, isActive ? styles.itemLabelActive : null]}>
        {item.label}
      </Text>
      {item.badge ? (
        <Text style={styles.itemBadge}>
          {item.badge > 99 ? "99+" : item.badge}
        </Text>
      ) : null}
      {isActive ? <View style={styles.itemUnderline} /> : null}
    </Pressable>
  );
}

function CurrentJobPill({ onPress }: { onPress: () => void }) {
  const job = useCurrentJob();

  if (!job) return null;

  return (
    <Pressable
      accessibilityLabel={`Current job: ${job.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.currentJob}
    >
      <Text numberOfLines={1} style={styles.currentJobText}>
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

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  inner: {
    width: "100%",
    maxWidth: layout.webContentMaxWidth,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  nav: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemPressed: {
    backgroundColor: colors.surface,
  },
  itemLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: "600",
  },
  itemLabelActive: {
    color: colors.primary,
  },
  itemBadge: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  // The bar's own bottom edge marks where you are, the way a left rail does in
  // the sidebar.
  itemUnderline: {
    position: "absolute",
    right: 0,
    bottom: -1,
    left: 0,
    height: 3,
    backgroundColor: colors.primary,
  },
  rightRule: {
    width: 1,
    alignSelf: "center",
    height: 28,
    backgroundColor: colors.border,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  currentJob: {
    maxWidth: 240,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.warningTint,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  currentJobText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  currentJobDue: {
    color: colors.warningText,
    fontWeight: "700",
  },
  account: {
    maxWidth: 230,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: spacing.md,
  },
  accountActive: {
    borderColor: colors.primaryTintBorder,
    backgroundColor: colors.primaryTint,
  },
  accountCopy: {
    flexShrink: 1,
    minWidth: 0,
  },
  accountName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  accountRole: {
    color: colors.mutedText,
    fontSize: 12,
  },
  accountBadge: {
    minWidth: 20,
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  accountBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
